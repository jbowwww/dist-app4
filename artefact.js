"use strict";
const log = require('@jbowwww/log');//.disable('debug');
const inspect = require('./utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const util = require('util');
const { EventEmitter } = require('events');
const mongoose = require('mongoose');
const { Document, Model, Query, SchemaTypes } = mongoose;
// mongoose.set('debug', true);

module.exports = Artefact;

/* new plan - very simple
 * Artefact(doc, ...extraArgs) where
 * 	doc: a mongoose document to centre the artefact around (may not be significant going forward, just for simplicity's sake for now)
 * 	...extraArgs: mongoose models or docs, or a combination of those. For models specified, it will retrieve
 *  docs from the model's collection where _artefactId = doc._id(=this._id). FOr docs, associates those docs with
 * 	artefact (by internally setting it's _artefactId)
 * for simple usage inside iteration loops, etc
 * e.g. (TODO)
 */
function Artefact(doc, ...extraArgs) {
	if (!(this instanceof Artefact))
		return new Artefact(doc, ...extraArgs);
	if (!(doc instanceof Document))
		throw new TypeError(`doc should be a mongoose.Document (doc=${inspect(doc)})`);
	this._id = doc._id;
	this._docs = new Set();
	this._docsByType = new Map();
	this._errors = [];
	for (const arg of [ doc, ...extraArgs ])
		this.add(arg);
	log.verbose(`Artefact _id=${this._id}=${inspect(this)}`);
}

Artefact.prototype = {

	...Artefact.prototype, 
	constructor: Artefact,
	
	// this[model] {}
	// get(model) {
	// 	return this._docsByType.get(model);
	// },
	set(model, doc) {
		doc._artefactId = this._id;
		this._docs.add(doc);
		this._docsByType.set(model.modelName, doc);
		if (model.baseModelName && doc instanceof Document)
			this._docsByType.set(/*mongoose.model*/(model.baseModelName), doc);
		log.verbose(`Artefact _id=${this._id}: Setting for model='${model.modelName},${doc instanceof Document && model.baseModelName}' doc._id=${doc._id}`);
		return this;
	},

	add(docOrModel) {
		let model;
		if (docOrModel instanceof Document) {
			model = docOrModel.constructor;
		} else if (typeof docOrModel === 'function'/* && docOrModel.name === 'Model'*/) {
			model = docOrModel;
			docOrModel = model.findOne({ _artefactId: this._id });
		} else if (docOrModel instanceof Query) {
			model = docOrModel.model;
			docOrModel.setQuery({ ...docOrModel.getFilter(), _artefactId: this._id });
		} else {
			throw new TypeError(`docOrModel should be a Document, Model(function) or Query but is=${typeof docOrModel} ${inspect(docOrModel)}`);
		}
		this.set(model, docOrModel);
		return this;
	},
	with(...args) { 
		for (const arg of args)
			this.add(arg);
		return this;
	},

	// returns { [doc.model.modelName]: mongoose.Document } where key is doc's model name
	// uses _docs, (so no duplicate entries, all unique
	async toDocuments() {
		return await Promise.all(
			Array.from(this._docs.values())
			.map(value => Promise.resolve(value)) // unnecessary? wouldn't Promise.all just internally Promise.resolve any immediate _docs.values() ?
		);
	},
	// returns { [doc.model]: doc }
	// does docsByType (so duplicate documents potentially, if inherited models used)
	async toObject() {
		const r = {};
		const promises = [];
		for (const [modelName, doc] of this._docsByType.entries())	{
			r[modelName] = doc;
			promises.push(Promise.resolve(doc).then(
				realDoc => r[modelName] = realDoc
			));
		}
		await Promise.all(promises);
		log.debug(`Artefact _id=${this._id} toObject=${inspect(r)}`);
		return r;
	},

	// accepts an artefact object, each value individually may be a mongoose.Document or a promise for one
	async setArtefact(artefact = null) {
		const origArg = artefact;
		if (!artefact) artefact = await this.toDocuments();
		log.debug(`Artefact _id=${this._id}.setArtefact(${inspect(origArg)})${!!origArg?'':(': set artefact='+inspect(artefact))}`);
		for (const doc of Object.values(artefact))
			if (doc) this.add(await doc);
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
		(await Promise.all(await this.toDocuments()))
		.map(async doc => doc && doc.isModified() && await doc.save());
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