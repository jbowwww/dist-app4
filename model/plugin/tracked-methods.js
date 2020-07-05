"use strict";
const log = require('@jbowwww/log');//.disable('debug');//('model/plugin/standard');
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const mongoose = require('mongoose');

const stat = require('./stat.js');

/* Track method call stats
 */
module.exports = function trackedNethodsSchemaPlugin(schema, trackedMethods) {

	const methods = [ ...trackedMethods.instance, ...trackedMethods.static ];
	schema.plugin(stat, methods);
	for (const methodName in methods) {
		schema.pre(methodName, function(next) {
			const doc = this instanceof mongoose.Document ? this : null;
			const model = doc instanceof mongoose.Document ? doc.constructor : this;
			if (model._stats && model._stats[methodName]) {
				// if (discriminatorKey && doc && doc[discriminatorKey]
				//  && model && model.discriminators
				//  && model.discriminators[doc[discriminatorKey]])
				// 	model = model.discriminators[doc[discriminatorKey]];
				// const eventName = 'pre.' + methodName;
				if (model) {
					// model.emit(eventName, doc);
					model._stats[methodName].calls++;
				}
				if (doc) {
					// doc.emit(eventName);			// i wonder what this gets bound as? in any case shuld be the doc
					const actionType = doc.isNew ? 'create' : doc.isModified() ? 'update' : 'check';
					model._stats[methodName][actionType]++;
				}
				log.debug(`[doc ${model.modelName}].pre('${methodName}'): doc=${inspect(doc)} next=${typeof next} model._stats.${methodName}=${inspect(model._stats[methodName])}`);
			} else {
				log.warn(`[doc ${model.modelName}].pre('${methodName}'): doc=${inspect(doc)} next=${typeof next} does not have _stats configured`);
			}
			next();
		});
		schema.post(methodName, function(res, next) {
			var doc = this instanceof mongoose.Document ? this
			 		: res instanceof mongoose.Document ? res : null;
			var model = doc instanceof mongoose.Document ? doc.constructor : this;
			if (model._stats && model._stats[methodName]) {
				// if (discriminatorKey && doc && doc[discriminatorKey]
				//  && model && model.discriminators
				//  && model.discriminators[doc[discriminatorKey]])
				// 	model = model.discriminators[doc[discriminatorKey]];
				// var eventName = 'post.' + methodName;
				if (model) {
					// model.emit(eventName, doc, res);
					model._stats[methodName].success++;
				}
				// if (doc)
				// 	doc.emit(eventName, res);
				log.debug(`[doc ${model.modelName}].post('${methodName}'): doc=${inspect(doc)} res=${inspect(res)} next=${typeof next} model._stats.${methodName}=${inspect(model._stats[methodName])}`);
			} else {
				log.warn(`[doc ${model.modelName}].pre('${methodName}'): doc=${inspect(doc)} next=${typeof next} does not have _stats configured`);
			}
			next();
		});
		schema.post(methodName, function(err, res, next) {
			var doc = this instanceof mongoose.Document ? this
			 		: res instanceof mongoose.Document ? res : null;
			var model = doc instanceof mongoose.Document ? doc.constructor : this;
			if (model._stats && model._stats[methodName]) {
				// if (discriminatorKey && doc && doc[discriminatorKey]
				//  && model && model.discriminators
				//  && model.discriminators[doc[discriminatorKey]])
				// 	model = model.discriminators[doc[discriminatorKey]];
				log.error(`[doc ${model.modelName}].post('${methodName}') ERROR: doc=${inspect(doc)} res=${inspect(res)} next=${typeof next} model._stats.${methodName}=${inspect(model._stats[methodName])}: error: ${err?err.stack:err}`);
				// var eventName = 'err.' + methodName;
				// at some point mongoose added its own Model.sonmething emitter that emits 'error', check it out
				if (model) {
					// model.emit(eventName, doc, err);
					model._stats[methodName].errors.push(err);
				}
				// if (doc)
				// 	doc.emit(eventName, err);
			} else {
				log.warn(`[doc ${model.modelName}].pre('${methodName}'): doc=${inspect(doc)} next=${typeof next} does not have _stats configured`);
			}
			return next(err);
		});
	}

	// schema.plugin(stat, trackedMethods.static);
	// trackedMethods.static.forEach(function(methodName) {
	// 	schema.pre(methodName, function(/*doc,*/ next) {
	// 		this.emit('pre.' + methodName/*, doc*/);
	// 		this._stats[methodName].calls++;
	// 		log.debug(`[model ${this.modelName}].pre('${methodName}'): callback( next=${typeof next} ) this=${inspect(this)}`);
	// 		next();	// something wrong with my implementation of [Model].static? I'm not getting a next() function from findOrCreate, and maybe 
	// 	});
	// 	schema.post(methodName, function(res, next) {
	// 		this.emit('post.' + methodName, res);
	// 		this._stats[methodName].success++;
	// 		log.verbose(`model ${this.modelName}].post('${methodName}'): res=${inspect(res)} next=${typeof next} this=${inspect(this)} model._stats.${methodName}=${inspect(this._stats[methodName])}`);
	// 		next();
	// 	});
	// 	schema.post(methodName, function(err, res, next) {
	// 		this.emit('err.' + methodName, res, err);
	// 		this._stats[methodName].errors.push(err);
	// 		log.error(`[model ${this.modelName}].post('${methodName}') ERROR: res=${inspect(res)} next=${typeof next} this=${inspect(this)} model._stats.${methodName}=${inspect(this._stats[methodName])}: error: ${err.stack||err}`);
	// 		return next(err);
	// 	});
	// });

};
