"use strict";
const log = require('@jbowwww/log');//('model/plugin/custom-hooks');
// const console = require('../../stdio.js').Get('model/plugin/custom-hooks.js', { minLevel: 'log' });	// log verbose debug
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const _ = require('lodash');
const Q = require('q');
Q.longStackSupport = true;
const mongoose = require('mongoose');
const { artefactDataPipe, chainPromiseFuncs } = require('../../promise-pipe.js');
const statPlugin = require('./stat.js');

/* By default, define middleware hooks for any static or instance method,
 * by overriding schema.prototype.static and schema.prototype.method
 * This behaviour can be disabled by supplying an options object as 
 * 3rd param to static() or method() with options.noCustomMiddleare = true
 */
// 190218 Might want to modify it so it only adds hooks for methods when middleware is registered for the method, for performance reasons
module.exports = function customHooksSchemaPlugin(schema, options) {

	// log.debug(`customHooksSchemaPlugin(): schema=${inspect(schema)}, options=${inspect(options)}, this=${inspect(this)}`);

	_.set(schema, 'static', function mongoose_schema_static(name, fn, options = {}) {
		if (!_.isString(name)) {
			throw new TypeError('name should be a string');
		} else if (!_.isFunction(fn)) {
			throw new TypeError('fn should be a function');
		}
		schema.plugin(statPlugin, [ name ]);
		// log.verbose(`schema: ${_.keys(schema.s.hooks).join(', ')}`);
		// schema.s.hooks.hook.call(schema.s.hooks, name, fn);
		// return mongoose.Schema.prototype.static.call(name, fn, options);
		const schemaHooksExecPost = Q.denodeify(schema.s.hooks.execPost.bind(schema.s.hooks));
		return mongoose.Schema.prototype.static.call(schema, name, options.noCustomMiddleware ? fn : function(...args) {
			const model = this;
			const modelName = model.modelName;
			return Q.denodeify(schema.s.hooks.execPre.bind(schema.s.hooks))(name, model, args)
				.tap(result => log.verbose(`[model ${modelName}].pre('${name}', ${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`))
				.then(() => Q(fn.apply(model, args)))
				.tap(result => log.verbose(`[model ${modelName}].${name}(${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`))
				.then(result => schemaHooksExecPost(name, model, [ result ]/*, { error: undefined }*/))
				.tap(result => log.verbose(`[model ${modelName}].post('${name}', ${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`))
				.catch(err => {
					log.warn(` ## [model ${modelName}].${name}(${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): rejected execPost: ${err.stack||err}`);
					schemaHooksExecPost(name, model, [ null ], { error: err });
					throw err;
				});
		});
	});

	_.set(schema, 'method', function mongoose_schema_method(name, fn, options = {}) {
		if (!_.isString(name)) {
			throw new TypeError('name should be a string');
		} else if (!_.isFunction(fn)) {
			throw new TypeError('fn should be a function');
		}
		schema.plugin(statPlugin, [ name ]);
		const schemaHooksExecPost = Q.denodeify(schema.s.hooks.execPost.bind(schema.s.hooks));
		return mongoose.Schema.prototype.method.call(this, name,
			options.noCustomMiddleware ? fn : function(...args) {
			const doc = this;
			const model = doc.constructor;
			const modelName = model.modelName;
			return Q.denodeify(schema.s.hooks.execPre.bind(schema.s.hooks))(name, doc, args)
				.tap(result => log.verbose(`[doc ${modelName}].pre('${name}', ${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`))
				.then(() => Q(fn.apply(doc, args)))
				.tap(result => log.verbose(`[doc ${modelName}].${name}(${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`))
				.then(result => schemaHooksExecPost(name, doc, [ result ]/*, { error: undefined }*/))
				.tap(result => log.verbose(`[doc ${modelName}].post('${name}', ${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): result=${inspect(result)}`))
				.catch(e => {
					log.warn(` ## [doc ${modelName}].${name}(${_.join(_.map(args, arg => inspect(arg, { compact: true }), ', '))}): rejected execPost: ${e.stack||err}`);
					schemaHooksExecPost(name, doc, [ null ], { error: e });
					throw e;
				});
		});
	});

};
