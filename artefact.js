"use strict";
const log = require('@jbowwww/log')//.disable('debug');
const inspect = require('./utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const { Document, Model, Query } = require('mongoose');

module.exports = Artefact;

// Returns { model, type } where model is the model object and type is string 'doc' 'model' or 'query'
function modelFromAspect(aspect) {
	const r = aspect instanceof Document ? { model: aspect.constructor/*.modelName*/, type: 'doc' }
		 : typeof aspect === 'function' /*&& aspect.name === 'Model'*/ ? { model: aspect/*.modelName*/, type: 'model' }
		 : typeof aspect === 'string' ? { model: mongoose.model(aspect)/*.modelName*/, type: 'model' }
		 : aspect instanceof Query ? { model: aspect.model/*.modelName*/, type: 'query' }
		 : { model: null, type: null }; //throw new Error(`Unknown aspect = ${inspect(aspect)}`);
	log.debug(`modelFromAspect(): ${inspect(r)} returned from aspect=${inspect(aspect)}`);
	return r;
}

function Artefact(...aspects) {
	if (!(this instanceof Artefact))
		return new Artefact(...aspects);
	Object.defineProperties(this, {
		_id: { enumerable: false, writable: true, value: null },
		_errors: { enumerable: false, writable: false, value: [] }
	});
	this.add(...aspects);
	log.verbose(`new Artefact _id=${this._id || '(null)'}=${inspect(this)}, enumerable props=${Object.keys(this).join(',')}`);
}

Artefact.prototype = {

	...Artefact.prototype, 
	constructor: Artefact,
	
	get logPrefix() { return `Artefact#${this._id||'(null)'}`; },
	warn(err, args = {}) {
		err = err instanceof Error ? err : new Error(err);
		err._artefact = this;
		err._artefactId = this._id;
		err = { ...err, args };
		this._errors.push(err instanceof Error ? err : new Error(err));
		log.warn(`${this.logPrefix}: WARN: ${err.message||err}`);
	},
	error(err, args = {}) {
		err = err instanceof Error ? err : new Error();
		err._artefact = this;
		err._artefactId = this._id;
		err = { ...err, args };
		this._errors.push(err);
		log.error(`${this.logPrefix}: WARN: ${err.message||err}`);
		throw err;
	},
	
	// get this(model) { return this.get(model); },
	// aspects are docs, models(string name or object model) or querys
	add(...aspects) {
		for (let aspect of aspects) {
			if (!aspect || aspect === null) { log.warn(`aspect null or undefined!`); continue; } 
			const { model, type } = modelFromAspect(aspect);
			if (model === null) {
				this.warn(new Error(`Model is null for aspect=${inspect(aspect)}`));
				continue;
			}
			if (!this._id) {
				// If artefact doesn't already have an artefactId, the first aspect needs to be a doc with id to use
				if (type !== 'doc') {
					this.warn(new Error(`Tried to add a model aspect without artefact ID`));
					continue;
				}
				// set the artefact id to doc id
				this._id = aspect._artefactId = aspect._id;
			} else if (type === 'doc') {
				// secondary doc ie we already had an artefactId, set it on the doc to associate
				aspect._artefactId = this._id;
			} else if (type === 'model') {
				// specify a model and will join using artefactId 
				aspect = model.findById(this._id);//.then(res => this[model.modelName] = aspect); // might want to delete prop if null or undef?
			} else if (type === 'query') {
				// same with query, just merges the artefactId into the query
				aspect = aspect.merge({ _id: this._id });//.then(res => this[model.modelName] = aspect); // might want to delete prop if null or undef?;
			// } else if (typeof aspect.then === 'function') {
				// promise-like - do i want to support this case or not? leave for now for simplicitys sake
			} else {
				this.warn(new Error(`Unknown aspect type, should be doc, model or query`)); 
			}
			this[model.modelName] = aspect;
			log.verbose(`${this.logPrefix}: Added aspect={ model: ${model.modelName}, type: ${type} }`);
		}
		return this;
	},
	with(...aspects) { return this.add(...aspects); },
	remove(...aspects) {
		for (const aspect of aspects) {
			const { model, type } = modelFromAspect(aspect);
			if (!model || (type !== 'doc' && type !== 'model' && type !== 'query')) {
				this.warn(`Unknown apsect type to remove aspect=${inspect(aspect)}`);
				continue;
			}
			delete this[model.modelName];
			log.verbose(`${logPrefix}: Removed aspect={ model: ${model.modelName}, type: ${type} }`);
		}
		return this;
	},
	// aspectsObj is a modelName-keyed object of values-docs, models, queries, promises
	async resolve(aspectsObj) {
		if (!!aspectsObj && aspectsObj !== null)
			this.add(...Object.values(aspectsObj));
		const promises = [];
		for (const [modelName, aspect] of Object.entries(this))	{
			if (!aspect) {
				log.warn(`${this.logPrefix}: aspect '${modelName}' == null`);	// not necessarily bad, possibly necessary, just want to know for now
				continue;
			}
			if (typeof aspect.then === 'function') {
				promises.push(Promise.resolve(aspect).then(realDoc => {
					log.debug(`Resolved promise for ${this.logPrefix}:${modelName} aspect=${inspect(realDoc)}`);
					if (!realDoc) {
						delete this[modelName];
					} else {
						this[modelName] = realDoc;
					}
				}));
			}
		}
		log.debug(`${this.logPrefix}: resolve(): Waiting on ${promises.length} promises...`);
		await Promise.all(promises);
		log.debug(`Artefact _id=${this._id} resolved to ${inspect(this)}`);
		return this;
	},

	// Perforns async function(s) on this constructed Artefact
	// functions if>1 are run in parallel, with individual try/catch blocks to report any function errors as warnings concerning a specific item(artefact)
	// Each function takes and returns a POJO representation of this artefact, keyed by model names (so discrimated docs will be duplicated with base/inherited model anems)
	// which is then "merged" (aka setArtefact) back into this artefact. Each individual property on returned object
	// can be a promise for or an actual mongoose document
	async do(options = {}, ...pipelineFuncs /*= (a) => {}*/) {
		// try {
			if (pipelineFuncs.length < 1) {
				if (typeof options === 'function') {
 					pipelineFuncs.push(options);
 					options = {};
				}
				else throw new TypeError(`Artefact.do should have at least one pipeline function`);
			}
			options = { save: true, ...options };
			log.verbose(`${this.logPrefix}: this = ${inspect(this)}`);
			await Promise.all(pipelineFuncs.map(async fn => {
				try {
					await this.resolve(await fn(await this.resolve()));
				} catch (e) {
					var newError = new Error(`Artefact.do exception in pipeline func '${fn.name||'(anon)'}' for artefact=${inspect(this)}: ${e.stack||e}`);
					// newError._artefact = this;
					// newError._artefactId = this._id;
					// newError._pipelineFunc = fn;
					log.warn(newError, fn);
				}
			 }));
			log.verbose(`${this.logPrefix}.do(${inspect(options)}):${pipelineFuncs.length} pipeline funcs returned a=${inspect(this)}`);
			if (options.save)
				await this.save();
			else
				log.verbose(`Artefact _id=${this._id} do func is not configured to save()`);
			return this;
		// } catch (e) {
		// 	var newError = new Error(`Artefact.do exception for _artefact=${inspect(this)}: ${e.stack||e}`);
		// 	newError._artefact = this;
		// 	newError._artefactId = this._id;
		// 	throw newError;
		// }
	},
	
	async save(options = {}) {
		log.verbose(`Artefact#${this._id}.save(): with types=${Object.keys(this).join(',')}`);
		// await Promise.all(
		await Promise.all(Object.entries(await this.resolve()).map(async ([modelName, aspect]) => {
			try {
				if (!aspect) { log.warn(`aspect = null fo artefact#${this._id}`); }
				else {
					log.debug(`Artefact#${this._id}.save(): model='${modelName}' isNew=${aspect.isNew} isModified=${aspect.isModified()} modifiedPaths=${aspect.modifiedPaths()} typeof=${typeof aspect.save} aspect=${inspect(aspect)}`);
					if (aspect && (aspect.isNew || aspect.isModified()))
						await aspect.save();
				}
				return aspect;
			}
			catch (e) {
				log.warn(`${this.logPrefix}	:${modelName}: ${e.stack||e}`);
			}
		}));
		return this;
	}

};

Artefact.pipe = async function* Artefact_pipe(iterable, ...args) {
	if (!iterable || !iterable[Symbol.asyncIterator])
		throw new TypeError(`Artefact.pipe: iterable is not an object or is not async iterable iterable=${inspect(iterable)}`);
	// if (args.length <= 0 || !(args[args.length - 1] instanceof Function))
	// 	throw new TypeError(`Artefact.pipe: Needs at least a pipe function`);
	const fn = (args.length <= 0 || !(args[args.length - 1] instanceof Function))
		? a => a : args.pop();
	for await (const doc of iterable) {
		yield await Artefact(doc, ...extras).do(fn);
	}
}