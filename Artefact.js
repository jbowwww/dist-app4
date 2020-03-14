"use strict";
const console = require('./stdio.js').Get('Artefact', { minLevel: 'verbose' });	// log verbose debug
const inspect = require('./utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const util = require('util');
const { EventEmitter } = require('events');
const _ = require('lodash');
const mongoose = require('mongoose');
// mongoose.set('debug', true);
// const { /*promisePipe,*/ artefactDataPipe, chainPromiseFuncs, iff, tap } = require('../../promise-pipe.js');

module.exports = Artefact;

// Triggers the Artefact build-chain / document integration behaviour, starting from the model
// of the documents supplied as variadic parameters of the ctor function
// e.g. wrap a File with the Artefact ctor ( "new Artefact( File.findOrCreate(path) )" )
// and if the Audio model references File (by calling Artefact.From({ types: {file: ...} }) somewhere in schema)
// and the Artefact build-chain will automagically either check for/fetch Audio document with same _artefactId as
// the File doc's _artefactId (if pre-existing), or (if File doc is newly created) attempt to create an AUdio
// document using that File document based on the relationshipdefined in the Artefact.From call 
function Artefact(...documents) {
	if (!(this instanceof Artefact)) {
		return new Artefact(arguments);
	}
	// other Artefact init stuff
}
util.inherits(Artefact, EventEmitter);
Artefact.prototype.constructor = Artefact;

// Defines one mongoose model as being dependent on, or created from, zero or more other types 
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