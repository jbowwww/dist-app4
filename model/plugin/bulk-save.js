"use strict";
const console = require('../../stdio.js').Get('model/plugin/bulk-save', { minLevel: 'log' });	// log verbose debug
const util = require('util');
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const _ = require('lodash');
const Q = require('q');
Q.longStackSupport = true;
const mongoose = require('mongoose');
mongoose.Promise = Q.Promise;

/* 190219: TODO: modify this implementation to act more analogous to Model.save() -
 *	1) return (fulfill) with document, from each call
 *	2) do so, a la Model.save(), as soon as the underlying collection method (bulkWrite) is called, not in callback as currently is
 * Attach bulkWrite() result as a (non-enumerable) property on each document in the bulk write? so calling code can still access
 * somehow, but the return value is still the document, so that this method can be used in pipelines
 */

module.exports = function bulkSaveSchemaPlugin(schema, options) {
	schema.plugin(require('./stat.js'), [ 'bulkSave' ]);

	/* 181222: Note: Don't use bulkSave (at least currently) in a promisePipe unless it is at the END or at the END of a tap chain
	 * Because currently it returns a bulkwriteopresult and not the document (unless the doc is unmodified requiring no save, then it returns a doc
	 * 190112: I should probably change this behaviour to return the doc, so it can be anywhere in a chain?
	 * 
	 */
	schema.method('bulkSave', function bulkSave(options) {

		var model = this.constructor;
		var doc = this;

		options = _.assign({
			maxBatchSize: 10,
			batchTimeout: 750
		}, options);

		return doc.validate().then(() => {
				console.verbose(`[model ${model.modelName}].bulkSave isNew=${doc.isNew} isModified()=${doc.isModified()} modifiedPaths=${doc.modifiedPaths()}`);// model._bulkSaveDeferred.promise.state=${model._bulkSaveDeferred?model._bulkSaveDeferred.promise.state:'(undefined)'}`);	// action=${actionType}
				
				if (!model._bulkSave) {
					model._bulkSave = [];
				} else if (model._bulkSave.indexOf(doc) >= 0) {
					console.verbose(`[model ${model.modelName}].bulkSave doc._id=${doc._id}: doc already queued for bulkWrite`);// (array index #${di}`); //  action=${actionType}
					return Q(doc);
				}
				var deferred = Q.defer();
				model._bulkSave.push({ doc, deferred, /*opIndex: model._bulkSave.length*/ });
				if (model._bulkSave.length >= options.maxBatchSize) {
					innerBulkSave();
				} else if (!model._bulkSaveTimeout) {
					model._bulkSaveTimeout = setTimeout(() => innerBulkSave(), options.batchTimeout);
				} 
				return deferred.promise;//.timeout(20000, `Error bulk writing doc: ${inspect(doc)}`);
				
				// Perform actual bulk save
				function innerBulkSave() {

					var bs = model._bulkSave;
					model._bulkSave = [];
					if (model._bulkSaveTimeout) {
						clearTimeout(model._bulkSaveTimeout);
						model._bulkSaveTimeout = false;
					}

					var bulkOps = _.map(bs, bsDoc => ({
						updateOne: {
							filter: { _id: bsDoc.doc._doc._id },
							update: { $set: bsDoc.doc._doc },
							upsert: true
						}
					}));
					console.debug(`[model ${model.modelName}].innerBulkSave( [${bulkOps.length}] = ${inspect(bulkOps, { depth: 5, compact: true })} )`);

					// 190112: TODO: Need to separate results for each individual doc and handle accordingly.
					// This will require returning a separate _bulkSaveDeferred for each doc bulkSave is called on, instead of one per batch write. 
					// Also need to imitate mongoose's marking of doc's isNew, isModified &^ modifiedPath & anything else associated, as closely as possible
					// currently, doc's saved with only bulkSave (ie not previously with save()) remain marked with isNew=true and paths marked modified 
					// see Model.prototype.$__handleSave around line 148 of mongoose/lib/model.js, includes, amongst other possibly relevant things, :
				    // this.$__reset();
				    // this.isNew = false;
				    // this.emit('isNew', false);
				    // this.constructor.emit('isNew', false);
				    // Apparently Model.prototype.bulkWrite does not handle any of this document logic (didn't believe it did, just making note for self)
					model.bulkWrite(bulkOps).then(bulkWriteOpResult => {	//bsEntry.op)).then(bulkWriteOpResult => {
						console.verbose(`[model ${model.modelName}].innerBulkSave(): bulkWriteOpResult=${inspect(bulkWriteOpResult, { depth: 6, compact: false })} bs[0].isNew=${bs[0].doc.isNew} bs[0].isModified()=${bs[0].doc.isModified()} bs[0].modifiedPaths=${bs[0].doc.modifiedPaths()}`);// model._bulkSaveDeferred.promise.state=${model._bulkSaveDeferred?model._bulkSaveDeferred.promise.state:'(undefined)'}
						var r = bulkWriteOpResult.result;
						// var upsertedIds = bulkWriteOpResult.getUpsertedIds();// _.map(r.upserted(u => u._id);
						// var insertedIds = bulkWriteOpResult.getInsertedIds();// _.map(r.inserted(i => i._id);
						var writeErrors = bulkWriteOpResult.getWriteErrors();
						// var successOps = _.map(_.concat(upsertedIds, insertedIds), id => _.find(bs, bs => bs.doc._doc._id === id));
						// var errorOps = _.difference(bs, successOps);
						var successOps = bs;
						var errorOps = []; 
						console.verbose(`[model ${model.modelName}].innerBulkSave(); successOps=${inspect(successOps)} errorOps=${inspect(errorOps)}`);
						_.forEach(successOps, op => op.deferred.resolve(bulkWriteOpResult));
						_.forEach(errorOps, op => op.deferred.reject(_.assign(new Error(`bulkWrite error for doc._id=${op.doc._doc._id}`), { bulkWriteOpResult })));
						if (writeErrors.length > 0) {
							console.warn(`[model ${model.modelName}].innerBulkSave(); bulkWriteOpResult.getWriteErrors()=${inspect(writeErrors)}`);
						}
						// if (upsertedIds.length != r.nUpserted || insertedIds.length != r.nInserted) {
						// 	var err = new Error(`Upserted or Inserted ID's length does not match result object's count: nUpserted=${r.nUpserted} upsertedIds=${inspect(upsertedIds)} nInserted=${r.nInserted} insertedIds=${inspect(insertedIds)}`);
						// 	// throw err;
						// 	console.warn(`[model ${model.modelName}].innerBulkSave(); bulkWriteOpResult.error: ${err.stack||err}`);
						// }
					})
					.catch(err => {
						console.warn(`[model ${model.modelName}].innerBulkSave(); bulkWrite error for doc._ids=${inspect(_.map(bs, op => op.doc._doc._id))}: ${err.stack||err}`);
					})
					.done();

				}
			});//.catch(err => reject(err));
		// });

	});

	// schema.pre('bulkSave', function() {
	// 	var model = this.constructor;
	// 	var doc = this;

	// 	options = _.assign({
	// 		maxBatchSize: 10,
	// 		batchTimeout: 750
	// 	}, options);

	// 	console.verbose(`[model ${model.modelName}].pre('bulkSave'): options=${inspect(options)} isNew=${doc.isNew} isModified()=${doc.isModified()} modifiedPaths=${doc.modifiedPaths()}`);

	// 	model._stats.bulkSave.calls++;
	// 	var actionType = doc.isNew ? 'create' : doc.isModified() ? 'update' : 'check';
	// 	doc._actions = _.merge(doc._actions || {}, { bulkSave: actionType });
	// 	model._stats.bulkSave[actionType]++;
	// })

	// schema.post('bulkSave')
};
