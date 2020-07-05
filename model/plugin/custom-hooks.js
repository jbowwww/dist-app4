"use strict";
const log = require('@jbowwww/log').disable('debug');//('model/plugin/custom-hooks');
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const { promisify } = require('util');
const mongoose = require('mongoose');
const statPlugin = require('./stat.js');

/* By default, define middleware hooks for any static or instance method,
 * by overriding schema.prototype.static and schema.prototype.method
 * This behaviour can be disabled by supplying an options object as 
 * 3rd param to static() or method() with options.noCustomMiddleare = true
 * 200317: 2nd and 3rd params (fn and options) can be in opposite order (for aesthetic reasons)
 */
// 190218 Might want to modify it so it only adds hooks for methods when middleware is registered for the method, for performance reasons
module.exports = function customHooksSchemaPlugin(schema, options) {

	Object.defineProperties(schema, {
		
		static: {
			writeable: false,
			value: function mongoose_schema_static(name, fn, options = {}) {
				if (typeof name !== 'string') {
					throw new TypeError('name should be a string');
				} else if (typeof fn !== 'function') {
					if (typeof fn === 'object' && typeof options === 'function') {
						const o = fn;
						fn = options;
						options = o;
					} else {
						throw new TypeError(`fn should be a function (typeof fn = ${typeof fn})`);
					}
				}
				schema.plugin(statPlugin, [ name ]);
				const schemaHooksExecPost = promisify(schema.s.hooks.execPost.bind(schema.s.hooks));
				return mongoose.Schema.prototype.static.call(schema, name,
					options.noCustomMiddleware ? fn 
				 : 	async function(...args) {	
						const model = this;
						const modelName = model.modelName;
						const argsString = args.map(arg => inspect(arg, { compact: true })).join(', ');
						try {
							let result = await promisify(schema.s.hooks.execPre.bind(schema.s.hooks))(name, model, args)
							log.debug(`[model ${modelName}].pre('${name}', ${argsString}): result=${inspect(result)}`);
							if (result) args[0] = result;
							result = await fn.apply(model, args);
							log.debug(`[model ${modelName}].${name}(${argsString}): result=${inspect(result)}`);
							if (result) args[0] = result;
							result = await schemaHooksExecPost(name, model, args);
							log.debug(`[model ${modelName}].post('${name}', ${argsString}): result=${inspect(result)}`);
							return result;
						} catch (err) {
							log.warn(` ## [model ${modelName}].${name}(${argsString}): rejected execPost: ${err.stack||err}`);
							schemaHooksExecPost(name, model, [ null ], { error: err });
							throw err;
						}
					});
			}
		},

		method: {
			writeable: false,
			value: function mongoose_schema_method(name, fn, options = {}) {
				if (typeof name !== 'string') {
					throw new TypeError('name should be a string');
				} else if (typeof fn !== 'function') {
					if (typeof fn === 'object' && typeof options === 'function') {
						const o = fn;``
						fn = options;
						options = o;
					} else {
						throw new TypeError(`fn should be a function (typeof fn = ${typeof fn})`);
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
						const argsString = args.map(arg => inspect(arg, { compact: true })).join(', ');
						try {
							let result = await promisify(schema.s.hooks.execPre.bind(schema.s.hooks))(name, doc, args); 
							log.debug(`[doc ${modelName}].pre('${name}', ${argsString}): result=${inspect(result)}`);
							if (result) args[0] = result;
							result = await fn.apply(doc, args);
							log.debug(`[doc ${modelName}].${name}(${argsString}): result=${inspect(result)}`);
							if (result) args[0] = result;
							result = await schemaHooksExecPost(name, doc, args);
							log.debug(`[doc ${modelName}].post('${name}', ${argsString}): result=${inspect(result)}`);
							return result;
						} catch (e) {
							log.warn(` ## [doc ${modelName}].${name}(${argsString}): rejected execPost: ${e.stack||err}`);
							schemaHooksExecPost(name, doc, [ null ], { error: e });
							throw e;
						};
					});
			}
		}

	});
};
