"use strict";
const console = require('../../stdio.js').Get('model/plugin/stat', { minLevel: 'log' });	// log verbose debug
const inspect = require('../../utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const util = require('util');
const _ = require('lodash');

/* Statistics for a model
 * schema: schema to apply plugin to
 * options: Object|Array<String>
 *	As an object, specifies the structure of model's _stats property object. Typically, although
 *	not enforced, top level properties correspond to model methods that will store stats, using
 *	the nested properties of the object.
 *	As an array of strings, specifies only the names of the top-level _stats properties, the 
 *	property names of those properties default to calls, success, failed, total, create, update,
 *	check and static (numbers), and an errors array
 */
module.exports = function statSchemaPlugin(schema, options) {

	options = _.merge({ validate: {}, save: {}, bulkSave: {} },
		_.isPlainObject(options) ? options
	 : 	_.fromPairs(_.map(options, methodName => ([methodName, {}]))));

	if (schema._stats === undefined) {
		schema.on('init', initModelStats);
		Object.defineProperty(schema, '_stats', { enumerable: true, writeable: true, configurable: true, value: { } });
	}
	_.assign(schema._stats, schema._stats || {}, options);

	function initModelStats(model) {
		console.verbose(`[model ${model.modelName}].on('init') schema._stats=${inspect(schema._stats)}`);//options=${inspect(options)}`);	//, schema.prototype=${inspect(schema.prototype)}, this=${inspect(this)}`);
		Object.defineProperty(model, '_stats', { enumerable: true, writeable: true, configurable: true, value: _.create({
			[util.inspect.custom]: function() {
				return _.pickBy(this, (v, k) => 
					v.calls > 0 || v.success > 0 || v.failed > 0
				 ||	v.create > 0 || v.update > 0 || v.check > 0 || v.static > 0);
			}
		},
		_.mapValues(schema._stats, (value, key) => _.create({
			[util.inspect.custom]: function() {
				return	this.calls === 0 && this.success === 0 && this.failed === 0 &&
						this.create === 0 && this.update === 0 && this.check === 0 && this.static === 0 ? `-empty-(${JSON.stringify(this)})`
				 : 	`{ calls: ${this.calls}, success: ${this.success}, failed: ${this.failed}, total: ${this.total},`
				 + 	` create: ${this.create}, update: ${this.update}, check: ${this.check}`	// , static: ${this.static}
				 + 	(this.errors.length === 0 ? '' : `, errors: [\n\t` + this.errors.join('\n\t') + ' ]') + ' }';
			}
		}, {
			calls: 0,												// how many raw calls to the stat thing being counted, before succeeded or failed 
			success: 0,												// how many calls to this stat succeeded 
			get failed() { return this.errors.length; },			// how many failed (counts errors)	
			get total() { return this.success + this.failed; },		// success + total (should be equal to calls, but this is another assumption/expectation to be tested)
			create: 0,
			update: 0,
			check: 0,
			static: 0,
			errors: []
		}, value ))) });
		console.debug(`schema.on('init'): modelName='${model.modelName}' model._stats=${util.inspect(model._stats)}`);
	}

};
