"use strict";
const log = require('@jbowwww/log').disable('debug');//('model/plugin/custom-hooks');
// const console = require('../../stdio.js').Get('model/plugin/custom-hooks.js', { minLevel: 'log' });	// log verbose debug
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const _ = require('lodash');
const { promisify } = require('util');
// const Q = require('q');
// Q.longStackSupport = true;
const mongoose = require('mongoose');
const { artefactDataPipe, chainPromiseFuncs } = require('../../promise-pipe.js');
const statPlugin = require('./stat.js');

/* By default, define middleware hooks for any static or instance method,
 * by overriding schema.prototype.static and schema.prototype.method
 * This behaviour can be disabled by supplying an options object as 
 * 3rd param to static() or method() with options.noCustomMiddleare = true
 * 200317: 2nd and 3rd params (fn and options) can be in opposite order (for aesthetic reasons)
 */
// 190218 Might want to modify it so it only adds hooks for methods when middleware is registered for the method, for performance reasons
module.exports = function customHooksSchemaPlugin(schema, options) {
	// log.debug(`customHooksSchemaPlugin(): schema=${inspect(schema)}, options=${inspect(options)}, this=${inspect(this)}`);

	_.set(schema, 'static', function mongoose_schema_static(name, fn, options = {}) {
		if (!_.isString(name)) {
			throw new TypeError('name should be a string');
		} else if (!_.isFunction(fn)) {
			if (_.isPlainObject(fn) && _.isFunction(options)) {
				const o = fn;
				fn = options;
				options = o;
			} else {
				throw new TypeError('fn should be a function');
			}
		}
		schema.plugin(statPlugin, [ name ]);
		const schemaHooksExecPost = promisify(schema.s.hooks.execPost.bind(schema.s.hooks));
		return mongoose.Schema.prototype.static.call(schema, name,
			options.noCustomMiddleware ? fn 
		 : 	async function(...args) {	
				const model = this;
				const modelName = model.modelName;
				try {
					let result = await promisify(schema.s.hooks.execPre.bind(schema.s.hooks))(name, model, args)
					log.debug(`[model ${modelName}].pre('${name}', ${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`);
					result = await fn.apply(model, args);
					log.debug(`[model ${modelName}].${name}(${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`);
					result = await schemaHooksExecPost(name, model, [ result ]/*, { error: undefined }*/);
					log.debug(`[model ${modelName}].post('${name}', ${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`);
					return result;
				} catch (err) {
					log.warn(` ## [model ${modelName}].${name}(${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): rejected execPost: ${err.stack||err}`);
					schemaHooksExecPost(name, model, [ null ], { error: err });
					throw err;
				}
			});
	});

	_.set(schema, 'method', function mongoose_schema_method(name, fn, options = {}) {
		if (!_.isString(name)) {
			throw new TypeError('name should be a string');
		} else if (!_.isFunction(fn)) {
			if (_.isPlainObject(fn) && _.isFunction(options)) {
				const o = fn;
				fn = options;
				options = o;
			} else {
				throw new TypeError('fn should be a function');
			}
		}
		schema.plugin(statPlugin, [ name ]);
		const schemaHooksExecPost = promisify(schema.s.hooks.execPost.bind(schema.s.hooks));
		return mongoose.Schema.prototype.method.call(this, name,
			options.noCustomMiddleware ? fn 
		 : 	async function(...args) {
				const doc = this;
				const model = doc.constructor;
				const modelName = model.modelName;
				try {
					let result = await promisify(schema.s.hooks.execPre.bind(schema.s.hooks))(name, doc, args); 
					log.debug(`[doc ${modelName}].pre('${name}', ${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`);
					result = await fn.apply(doc, args);
					log.debug(`[doc ${modelName}].${name}(${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`);
					result = await schemaHooksExecPost(name, doc, [ result ]/*, { error: undefined }*/);
					log.debug(`[doc ${modelName}].post('${name}', ${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`);
					return result;
				} catch (e) {
					log.warn(` ## [doc ${modelName}].${name}(${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): rejected execPost: ${e.stack||err}`);
					schemaHooksExecPost(name, doc, [ null ], { error: e });
					throw e;
				};
			});
	});

};
