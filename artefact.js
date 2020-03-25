"use strict";
const log = require('@jbowwww/log').disable('debug');
const inspect = require('./utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const util = require('util');
const { EventEmitter } = require('events');
const { Document, Model, Query, SchemaTypes } = require('mongoose');
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
async function Artefact(doc, ...extraArgs) {
	if (!(doc instanceof Document))
		throw new TypeError(`doc should be a mongoose.Document (doc=${inspect(doc)})`);
	this._id = doc._id;
	log.verbose(`Constructing Artefact _id=${this._id} from doc=${inspect(doc)}`);
	for (const extra of extraArgs) {
		const aIdType = extra.schema.path('_artefactId');
		if (!aIdType || aIdType.type !== SchemaTypes.ObjectId)
			throw new TypeError(`extras should be a mongoose.Document or mongoose.Model with the artefact model plugin`);
		let doc;
		if (extra instanceof Document) {
			doc = extra;
			// TODO: handle base models and set properties for those too e.g. FsEntry base of File
		} else if (extra instanceof Model) {
			doc = await extra.findOne({ _artefactId: this._id });
			log.verbose(`Artefact _id=${this._id}: querying model='${extra.modelName}`);
		}
		if (doc) this[doc.model.modelName] = doc;
		log.verbose(`Artefact _id=${this._id}: Adding extra doc=${inspect(doc)}`);
	}
	this.do = async function Artefact_do(options, fn) {
		if (fn === undefined) { fn = options; options = {} };
		if (!(fn instanceof Function)) throw new TypeError(`fn should be a function: fn=${inspect(fn)}`);
		options = { save: true, ...options };
		log.verbose(`Running do func on artefact _id=${this._id}`);
		const a = await fn(this);
		loglverbose(`Artefact do func yielded a=${inspect(a)}`);
		if (options.save) {
			await a.save();
			log.verbose(`Artefact _id=${this._id} saved`);
		} else {
			log.verbose(`Artefact _id=${this._id} do func is not configured to save()`);
		}
		return a;
	}
	log.info(`Artefact _id=${this._id}=${inspect(this)}`);
}

Artefact.pipe = async function* Artefact_pipe(iterable, ...args) {
	if (!iterable || !iterable[Symbol.asyncIterator])
		throw new TypeError(`Artefact.pipe: iterable is not an object or is not async iterable iterable=${inspect(iterable)}`);
	if (args.length <= 0 || !(args[args.length - 1] instanceof Function))
		throw new TypeError(`Artefact.pipe: Needs at least a pipe function`);
	const fn = args.pop();
	for await (const doc of iterable) {
		yield await Artefact(doc, ...extras).do(fn);
	}
}