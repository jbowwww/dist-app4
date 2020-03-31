"use strict";
const log = require('@jbowwww/log').disable('debug');
const inspect = require('./utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const util = require('util');
const { EventEmitter } = require('events');
const mongoose = require('mongoose');
const { Document, Model, Query, SchemaTypes } = mongoose;
// mongoose.set('debug', true);
// const { /*promisePipe,*/ artefactDataPipe, chainPromiseFuncs, iff, tap } = require('../../promise-pipe.js');

module.exports = Artefact;

/* new plan - very simple
 * Artefact(doc, ...extraArgs) where
 * 	doc: a mongoose document to centre the artefact around (may not be significant going forward, just for simplicity's sake for now)
 * 	...extraArgs: mongoose models or docs, or a combination of those. For models specified, it will retrieve
 *  docs from the model's collection where _artefactId = doc._id. FOr docs, associates those docs with
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
	log.verbose(`Constructing Artefact _id=${this._id} from doc=${inspect(doc)}`);
	
	for (const extra of [ doc, ...extraArgs ]) {
		if (extra instanceof Document) {
			this.add(extra);
		} else if (extra instanceof Model) {
			this.add(extra.model, extra.findOne({ _artefactId: this._id }).then((err, doc) => {
				if (err) throw new Error(err);
				this.add(extra.model, doc);
			}));
			log.verbose(`Artefact _id=${this._id}: querying model='${extra.modelName}, types= ${extra.modelName}, ${extra.baseModelName}`);
		}
	}

	log.info(`Artefact _id=${this._id}=${inspect(this)}`);
}

Artefact.prototype = { ...Artefact.prototype, 

	constructor: Artefact,
	
	get(model) {
		return this._docsByType.get(model);
	},
	set(model, doc) {
		doc._artefactId = this._id;
		this._docs.add(doc);
		this._docsByType.set(model, doc);
		if (model.baseModelName && doc instanceof Document)
			this._docsByType.set(mongoose.model(model.baseModelName), doc);
		log.verbose(`Artefact _id=${this._id}: Setting for model='${model.modelName},${doc instanceof Document && model.baseModelName}' doc=${inspect(doc)}`);
		return this;
	},
	setArtefact(artefact) {
		if (artefact) {
			for (const doc of artefact)
				if (doc) this.add(doc);
		}
		return this;
	},
	async resolveArtefact() {
		this.setArtefact(await /*Promise.all*/(this.toDocuments()));
	},

	with(...args) { return this.add(...args); },
	add(docOrModel) {
		let model;
		if (docOrModel instanceof Document) {
			model = docOrModel.constructor;
		} else if (typeof docOrModel === 'function'/* && docOrModel.name === 'Model'*/) {
			model = docOrModel;
			docOrModel = model.findOne();
		} else if (docOrModel instanceof Query) {
			model = docOrModel.model;
		} else {
			throw new TypeError(`docOrModel should be a Document or Model but is=${typeof docOrModel} ${inspect(docOrModel)}`);
		}
		if (docOrModel instanceof Query) {
			docOrModel.setQuery({ ...docOrModel.getFilter(), _artefactId: /*SchemaTypes.ObjectId*/(this._id) });
		}
		this.set(model, docOrModel);
		return this;
	},
	
	async toDocuments() {
		const values = [];
		const valuesIter = this._docs.values();
		for (const value of valuesIter)
			values.push(value);
		return await Promise.all(values.map(value => Promise.resolve(value)));
	},
	async toObject() {
		const r = {};
		const promises = [];
		for (const [model, doc] of this._docsByType.entries()) {
			r[model.modelName] = doc;
			if (typeof doc.then === 'function') {
				promises.push(doc.then(
					realDoc => r[model.modelName] = realDoc
				));
			}
		}
		await Promise.all(promises);
		log.verbose(`Artefact _id=${this._id} toObject=${inspect(r)}`);
		return r;
	},

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
			log.verbose(`Running ${pipelineFuncs.length} do funcs on Artefact#${this._id}.do(${inspect(options)})`);
			// const docPromises = await this.toDocuments();
				// .map(async docPromise => typeof docPromise.then === 'function' ? await docPromise.then() : docPromise);
			// log.verbose(`Artefact do func on artefact _id=${this._id} awaiting ${docPromises.length} promises`);
			// this.setArtefact(await Promise.all(docPromises));
			await this.resolveArtefact();
			await Promise.all(pipelineFuncs.map(async fn => {
				try {
					this.setArtefact(await fn(await this.toObject()));
				} catch (e) {
					var newError = new Error(`Artefact.do exception for _artefact=${inspect(this)}: ${e.stack||e}`);
					newError._artefact = this;
					newError._artefactId = this._id;
					newError._pipelineFunc = fn;
					this._errors.push(newError);
				}
			 }));
			log.verbose(`Artefact ${pipelineFuncs.length} do funcs on artefact _id=${this._id} returned a=${inspect(this)}`);
			if (options.save) {
				await this.save();
				log.verbose(`Artefact save for artefact _id=${this._id} returned a=${inspect(this)}`);
			} else {
				log.verbose(`Artefact _id=${this._id} do func is not configured to save()`);
			}
			return this;
		// } catch (e) {
		// 	var newError = new Error(`Artefact.do exception for _artefact=${inspect(this)}: ${e.stack||e}`);
		// 	newError._artefact = this;
		// 	newError._artefactId = this._id;
		// 	throw newError;
		// }
	},
	
	async save(options = {}) {
		(await Promise.all(await this.toDocuments()))
			// .map(async docPromise => typeof docPromise.then === 'function' ? await docPromise.then() : docPromise)
			.map(async doc => doc && doc.isModified() && await doc.save());
	},
	
	[util.inspect.custom]() {
		return inspect(this._docsByType);//{ _id: this._id, ...Object.fromEntries(this._docsByType.entries()) });//Object.fromEntries([ [ '_id', this._id ], ...this._docsByType.entries() ]));
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