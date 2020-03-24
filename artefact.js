"use strict";
const log = require('@jbowwww/log').disable('debug');
const inspect = require('./utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const util = require('util');
const { EventEmitter } = require('events');
const { Document, Model, Query } = require('mongoose');
// mongoose.set('debug', true);
// const { /*promisePipe,*/ artefactDataPipe, chainPromiseFuncs, iff, tap } = require('../../promise-pipe.js');

module.exports = Artefact;

Artefact(a => a.set(
	FsEntry.findOrCreate({ path: '/path' }),

));

module.exports = Artefact;

/* paramneter is a call back that takes one parameter, the artefact and defines the models/docs/queries in it
 * e.g.
 *	Artefact(
 *		File.findOrCreate({ path: '/some/path' }),
 *		Audio.from(File),	// model static method returns something like 
 *							//	a => { if (a[File]) { a[Audio] = new Audio({...}) } }.
 *							// a function a => await file && await a.file && Audio.fromFile(a.file)
 *		Sample.from(File, Audio)	// 'from' static method takes ...models as param
 *	})
 *	// Artefact() iterates each parameeter and :
 *	// if it is a promise, resolves it and calls itself with result
 *	// if it is a qwuery, exec's it and calls itself for result or for each document returned
 *	// if it is an iterable (query may be that as well / one and the same), async iterates it and for each
 *	// 	item in iterator, calls itself
 *	// -----
 *	// If it is a function with one param (like returned from Model.from()), calls the fn with this (artefact)
 * 	//  as parameter. The function is free to do/await from the artefact what it wants berfore returning
 *  //	and it may return a document, or an array of documents, which will all be associated with the artefact
 * 	// 	instance.
 *	* Can include > 1 iterable in the artefact collection although semantics would get complicated
 *	* very fast and I'm not sure if there's any actual use cases for that. If it is done though,
 *	* each iterable it encounters would be iterated, in the order they appear in params. So first
 *	* iterable gets iterated, for each item yielded from that, the 2nd iterable in params gets iterated
 *	* , potentially (and probably necessarily, to be useful) using data from the item being iterated
 *	* from 1st iterable.
 *	OR just keep it simple, iterate iterables manually as required, then use Artefact() inside the loop
 *	// 
 */ 
async function Artefact(...args) {
	if (args.length < 1) throw new ArgumentError(`Artefact requires at least one argument`);
	let artefact = new ArtefactObject();
	let result;
	for (const i = 0; i < args.length; i++) {
		try {
			result = !arg && i != 0
		?	throw new ArgumentError(`a is falsey: ${inspect(a)}`)
		:	arg.then === 'function' ?
			await arg
		: 	await arg(artefact);
			log.verbose(`result #${i}=${inspect(result)}`);
			await artefact.add(result);	// result can be mongoose doc or array of docs
			log.debug(`artefact #${i}=${inspect(artefact)}`);
		} catch (e) {
			log.warn(`Artefact: ERROR a #${i}: ${a}: ${e.stack||e}`);
			continue;
		}
	}
	await artefact.save();
}

class ArtefactObject {
	
	constructor(...documents) {
		super();
		this._ = new Map();
		for (const doc of documents)
			this.set(doc.model, doc);
	},

	async add(addArgs) {
		await Promise.all(!addArgs ? []
		:!addArgs.length ? [ addArgs ]
		:addArgs)..map(doc =>
			_[doc.model] = await doc);
		return this;
	}

	async save() {
		await Promise.all(_.map(([model, doc] => {
			log.debug(`Artefact.save(): [modelName='${model.modelName}', doc=${inspect(doc)}]`);
			return doc.save();
		}
	}
	get(prop) { return this._[prop]; }
	set(prop, doc) {
		if (!(prop instanceof Model) || !(doc instanceof Document))
			throw new TypeError(`Artefact only accepts documents, prop '${prop}' can't be set to ${inspect(doc)}`);

	}
}
/* Defines one mongoose model as being dependent on, or created from, zero or more other types 
 */
Artefact.From = function Artefact_From(options = {
	// general artefact options..?
	types: {	// an artefact-able model either requires these types before they can be integrated into the Artefact, or maybe some can be optional
		// e.g. for the audio model .. 
		// file: { filter(file) => file.path && file.path.match(/^.*\.[a-z]+$/i) }
		//		^ .. maybe other props too ..>
	}
}) {
	// TODO: Some clever way of storing the inter-depencies and (semi-)automagically building 
	// artefacts by integrating models as they reference each other, from any point the Artefact
	// constructor is wrappered around a mongoose model(s).
	// Therefore args of Artefact ctor should be (...documents) i.E variadic array of one or
	// more mongoose docs?)
};