"use strict";
const log = require('@jbowwww/log')//.disable('debug');
const inspect = require('./utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const util = require('util');
const { EventEmitter } = require('events');
const { map: promiseMap } = require('@jbowwww/promise');
const mongoose = require('mongoose');
const { Document, Model, Query, SchemaTypes } = mongoose;
// mongoose.set('debug', true);

module.exports = Artefact;

/* new plan - very simple
 * for simple usage inside iteration loops, etc
 * e.g. (TODO)
 * Artefact(doc, ...extraArgs) where
 * 	doc: a mongoose document to centre the artefact around (may not be significant going forward, just for simplicity's sake for now)
 * 	...extraArgs: mongoose models or docs, or a combination of those.
 * For models specified, it will retrieve docs from the model's collection where _artefactId = doc._id(=this._id).
 * FOr docs, associates those docs with artefact (by internally setting it's _artefactId)
 */
function Artefact(doc, ...extraArgs) {
	if (!(this instanceof Artefact))
		return new Artefact(doc, ...extraArgs);
	if (!(doc instanceof Document))
		throw new TypeError(`doc should be a mongoose.Document (doc=${inspect(doc)})`);
	this._id = doc ? doc._id : null;
	this._docs = new Set();
	this._docsByType = new Map();
	this._errors = [];
	for (const arg of [ doc, ...extraArgs ])
		if (arg) this.set(arg);
	log.verbose(`new Artefact _id=${this._id || '(null)'}=${inspect(this)}`);
}

Artefact.prototype = {

	...Artefact.prototype, 
	constructor: Artefact,
	
	// get this(model) { return this.get(model); },
	get(model) {
		return this._docsByType.get(model);
	},
	set(docOrModel) {
		let model;
		if (docOrModel instanceof Document) {
			model = docOrModel.constructor;
			if (this._id) docOrModel._artefactId = this._id;
			else this._id = docOrModel._artefactId;
		} else if (typeof docOrModel === 'function'/* && docOrModel.name === 'Model'*/) {
			model = docOrModel;
			docOrModel = model.findOne({ _artefactId: this._id });
		} else if (docOrModel instanceof Query) {
			model = docOrModel.model;
			docOrModel.setQuery({ ...docOrModel.getFilter(), _artefactId: this._id });
		} else {
			throw new TypeError(`docOrModel should be a Document, Model(function) or Query but is=${typeof docOrModel} ${inspect(docOrModel)}`);
		}
		if (docOrModel) {
			this._docs.add(docOrModel);
			this._docsByType.set(model.modelName, docOrModel);
		}
		// if (model.baseModelName)// && docOrModel instanceof Document)
		// 	this._docsByType.set(model.baseModelName, docOrModel);
		log.verbose(`Artefact _id=${this._id}: Setting for model='${model.modelName},${model.baseModelName}' docOrModel._id=${docOrModel._id}`);
		return this;
	},
	with(...args) { 
		for (const arg of args)
			this.set(arg);
		return this;
	},

	// returns { [doc.model.modelName]: mongoose.Document } where key is doc's model name
	// uses _docs, (so no duplicate entries, all unique
	async toDocuments() {
		log.debug(`Artefact _id=${this._id}.toDocuments(); this=${inspect(this)}`);
		// return await Promise.all(this._docs.values());
		return await Promise.all(
			Array.from(this._docs.values()).map(async value => {
				const resolvedValue = await Promise.resolve(value); // unnecessary? wouldn't Promise.all just internally Promise.resolve any immediate _docs.values() ?
				this._docs.delete(value);
				if (resolvedValue && resolvedValue !== value && resolvedValue != null) {
					this.set(resolvedValue);
					return resolvedValue;
				}
				else {
					return value;
				}
			})
		);
	},
	// returns { [doc.model]: doc }
	// does docsByType (so duplicate documents potentially, if inherited models used)
	async toObject() {
		const r = {};
		const promises = [];
		for (const [modelName, doc] of this._docsByType.entries())	{
			// r[modelName] = doc;
			promises.push(Promise.resolve(doc).then(
				realDoc => r[modelName] = realDoc
			));
		}
		await Promise.all(promises);
		log.debug(`Artefact _id=${this._id} toObject=${inspect(r)}`);
		return r;
	},

	// accepts an artefact object, each value individually may be a mongoose.Document or a promise for one
	// if artefact not supplied awaits on resolution of this artefact's components which may be promises (including queries[thenables])
	async setArtefact(artefact = null) {
		const origArg = artefact;
		if (!artefact) artefact = await this.toDocuments();
		log.debug(`Artefact _id=${this._id}.setArtefact(${inspect(origArg)})${!!origArg?'':(': set artefact='+inspect(artefact))}`);
		for (const doc of Object.values(artefact))
			if (doc) this.set(await doc);
		return this;
	},

	// Perforns async function(s) on this constructed Artefact
	// functions if>1 are run in parallel, with individual try/catch blocks to report any function errors as warnings concerning a specific item(artefact)
	// Each function takes and returns a POJO representation of this artefact, keyed by model names (so discrimated docs will be duplicated with base/inherited model anems)
	// which is then "merged" (aka setArtefact) back into this artefact. Each individual property on returned object
	// can be a promise for or an actual mongoose document
	async do(options = {}, ...pipelineFuncs /*= (a) => {}*/) {
		// try {
			if (pipelineFuncs.length < 1) {
				if (typeof options === 'function') {
 					pipelineFuncs.push(options);
 					options = {};
				}
				else throw new TypeError(`Artefact.do should have at least one pipeline function`);
			}
			options = { save: true, ...options };
			await Promise.all(pipelineFuncs.map(async fn => {
				try {
					await this.setArtefact(await fn(await this.toObject()));
				} catch (e) {
					var newError = new Error(`Artefact.do exception in pipeline func '${fn.name||'(anon)'}' for _artefact=${inspect(this)}: ${e.stack||e}`);
					newError._artefact = this;
					newError._artefactId = this._id;
					newError._pipelineFunc = fn;
					this._errors.push(newError);
					log.warn(newError);
				}
			 }));
			log.verbose(`Artefact#${this._id}.do(${inspect(options)}):${pipelineFuncs.length} pipeline funcs returned a=${inspect(this)}`);
			if (options.save)
				await this.save();
			else
				log.verbose(`Artefact _id=${this._id} do func is not configured to save()`);
			return this;
		// } catch (e) {
		// 	var newError = new Error(`Artefact.do exception for _artefact=${inspect(this)}: ${e.stack||e}`);
		// 	newError._artefact = this;
		// 	newError._artefactId = this._id;
		// 	throw newError;
		// }
	},
	
	async save(options = {}) {
		log.verbose(`Artefact#${this._id}.save(): with types=${Array.from(this._docsByType.keys()).join(',')}`);
		// await Promise.all(
		(await this.toDocuments()).map(async doc => {
			if (!doc) { log.warn(`doc = null fo artefact#${this._id}`); }
			else {
				log.debug(`Artefact#${this._id}.save(): model='${doc.constructor.modelName}' isNew=${doc.isNew} isModified=${doc.isModified()}`)
				if (doc && (doc.isNew || doc.isModified()))
					await doc.save();
			}
		});
		return this;
	},
	
	[util.inspect.custom]() {
		return inspect({
			_id: this._id,
			...Object.fromEntries(Array.from(this._docsByType.entries()).map(([k, v]) => ([k, v])))//			...Object.fromEntries(Array.from(this._docsByType.entries()).map([key, value] => )
		}, { maxDepth: 3 });
	}

};

Artefact.pipe = async function* Artefact_pipe(iterable, ...args) {
	if (!iterable || !iterable[Symbol.asyncIterator])
		throw new TypeError(`Artefact.pipe: iterable is not an object or is not async iterable iterable=${inspect(iterable)}`);
	// if (args.length <= 0 || !(args[args.length - 1] instanceof Function))
	// 	throw new TypeError(`Artefact.pipe: Needs at least a pipe function`);
	const fn = (args.length <= 0 || !(args[args.length - 1] instanceof Function))
		? a => a : args.pop();
	for await (const doc of iterable) {
		yield await Artefact(doc, ...extras).do(fn);
	}
}