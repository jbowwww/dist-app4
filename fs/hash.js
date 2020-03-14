"use strict";

const console = require('../stdio.js').Get('fs/hash', { minLevel: 'log' });	// debug verbose log
// console.debug(`utility.inspect: ${typeof require('./utility.js').makeInspect}`);

// const	inspect = require('./utility.js').makeInspect({ depth: 2, breakLength: 0 })//()=>undefined
// ,	_.mixin = require('./utility.js')._.mixin
const _ = require('lodash')
// , bindMethods = require('./utility.js').bindMethods
, pipeline = require('../utility.js').pipeline
// ,	util = require('util')
,	fs = require('fs')
// , nodePath = require('path')
// , EventEmitter = require('events')//emitter3');
// ,	stream = require('stream')
,	Q = require('q')
Q.longStackSupport = true;
// ,	promisifyEmitter = require('./utility.js').promisifyEmitter
const crypto = require('crypto');
const pEvent = require('p-event');

// Returns promise for a hash string
module.exports = function hash(path, options) {
	var options = Object.assign({}, { algorithm: 'sha256', encoding: 'hex' }, options);
	var hashStream = crypto.createHash(options.algorithm);
	hashStream.setEncoding(options.encoding);
	return Q(pEvent(pipeline(fs.createReadStream(path, options), hashStream), 'data'))
	.then(hashData => hashData.toString(options.encoding));
	// .catch(err => console.error(`Hashing error: ${err.stack||err}`));
}
