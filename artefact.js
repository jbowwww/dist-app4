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
	if (!this instanceof Artefact)
		return new Artefact(doc, ...extraArgs);
	if (!(doc instanceof Document))
		throw new TypeError(`doc should be a mongoose.Document (doc=${inspect(doc)})`);
	
	this._id = doc._id;
	this._docs = new Set();
	this._docsByType = new Map();
	log.verbose(`Constructing Artefact _id=${this._id} from doc=${inspect(doc)}`);
	
	for (const extra of [ doc, ...extraArgs ]) {
		if (extra instanceof Document) {
			this.add(extra);
		} /*else if (extra instanceof Model) {
			thisextra.modelName] = extra.findOne({ _artefactId: this._id }).then((err, doc) => {
				if (err) throw new Error(err);
				this.add(doc);
			});
			log.verbose(`Artefact _id=${this._id}: querying model='${extra.modelName}, types= ${extra.modelName}, ${extra.baseModelName}`);
		}*/
	}

	log.info(`Artefact _id=${this._id}=${inspect(this)}`);
}

Artefact.prototype.constructor = Artefact;

Artefact.prototype = {

	constructor: Artefact,
	
	get(model) {
		return this._docsByType.get(model);
	},
	set(model, doc) {
		doc._artefactId = this._id;
		this._docs.add(doc);
		this._docsByType.set(model, doc);
		if (model.baseModelName)
			this._docsByType.set(mongoose.model(model.baseModelName), doc);
		return this;
	},
	
	add(doc) {
		const model = doc.constructor;
		this.set(model, doc);
		log.verbose(`Artefact _id=${this._id}: Adding doc=${inspect(doc)}, types = ${model.modelName},${model.baseModelName}`);
		return this;
	},

	async do(options = {}, fn = (a) => {}) {
		try {
			if (fn === undefined) { fn = options; options = {} };
			if (!(fn instanceof Function)) throw new TypeError(`fn should be a function: fn=${inspect(fn)}`);
			options = { save: true, ...options };
			log.verbose(`Running do func on artefact _id=${this._id}`);
			const r = await fn(this);
			//if (r) this.set(r);
			log.verbose(`Artefact do func on artefact _id=${this._id} returned a=${inspect(this)}`);
			if (options.save) {
				await this.save();
				log.verbose(`Artefact save for artefact _id=${this._id} returned a=${inspect(this)}`);
			} else {
				log.verbose(`Artefact _id=${this._id} do func is not configured to save()`);
			}
			return this;
		} catch (e) {
			var newError = new Error(`Artefact.do exception for _artefact=${inspect(this)}: ${e.stack||e}`);
			newError._artefact = this;
			newError._artefactId = this._id;
			throw newError;
		}
	},
	
	async save(options = {}) {
		await Promise.all((() => {
			const values = [];
			const valuesIter = this._docs.values();
			for (const value of valuesIter)
				values.push(value);
			return values;
		})().map(doc => doc.save()));
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