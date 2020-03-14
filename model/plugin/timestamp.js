"use strict";

const console = require('../../stdio.js').Get('model/plugin/timestamp', { minLevel: 'log' });	// log verbose debug
const inspect = require('../../utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const _ = require('lodash');
const Q = require('q');

module.exports = function timestampSchemaPlugin(schema, options) {
	
	console.debug(`timestampSchemaPlugin(): schema=${inspect(schema)}, options=${inspect(options)}, this=${inspect(this)}`);

	schema.add({
		_ts: {
		createdAt: { type: Date, required: true, default: () => Date.now() },
		checkedAt: { type: Date, required: false },
		updatedAt: { type: Date, required: false },
		deletedAt: { type: Date, required: false }
	} });

	schema.virtual('isDeleted').get(function() {
		return this._ts.deletedAt && this._ts.deletedAt <= Date.now();
	});

	// schema.set('toObject', { getters: true, virtuals: true });
	// schema.set('toJSON', { getters: true, virtuals: true });

	// for now this works for save() and bulkSave()
	// might also want to hook it to update middlewares to support that group of functions
	schema.post('validate', function(doc, next) {
		if (!doc) {
			doc = this;
		}
		var model = doc.constructor;
		if (!doc._ts.createdAt && !doc.isNew) {
			return next(new Error(`[model ${model.modelName}].post('validate')#timestampSchemaPlugin: !doc._ts.createdAt !doc.isNew ${doc.isModified()?'':'!'} doc.isModified()`));
		} else if (doc._ts.created && doc.isNew) {
			return next(new Error(`[model ${model.modelName}].post('validate')#timestampSchemaPlugin: doc._ts.createdAt && doc.isNew ${doc.isModified()?'':'!'} doc.isModified()`));
		}
		var now = Date.now();
		if (doc.isNew) {
			doc._ts.createdAt = doc._ts.updatedAt = doc._ts.checkedAt = now;
		} else if (doc.isModified()) {
			doc._ts.updatedAt = doc._ts.checkedAt = now;
		} else if (!doc._ts.updatedAt) {
			doc._ts.checkedAt = now;
		}

		console.verbose(`[model ${model.modelName}].post('validate')#timestampSchemaPlugin: isNew=${doc.isNew} ${doc.modifiedPaths().join(' ')}`);
		return next();
	});

	
	schema.method('markDeleted', function(timestamp = Date.now()) {
		if (this._ts.deletedAt) { console.warn(`Doc being marked deleted already has deletedAt=${this._ts.deletedAt}`); }
		this._ts.deletedAt = timestamp;
		return Q(this);
	});

	schema.method('latest', function() {
		let ts = this._ts;
		let latest = ts.updatedAt;
		if (!latest || _ts.createdAt > latest) {
			latest = _ts.createdAt;
		}
		if (!latest || _ts.checkedAt > latest) {
			latest = _ts.checkedAt;
		}
		if (!latest || _ts.deletedAt > latest) {
			latest = _ts.deletedAt;
		}
		return latest;
	});

	/* Returns true if the timestamps indicate this object is still current relative to given timestamp */
	schema.method('hasUpdatedSince', function(timestamp) {
		return (this._ts.updatedAt && (this._ts.updatedAt >= timestamp))
		 || (this._ts.checkedAt && (this._ts.checkedAt >= timestamp));
	});
};
