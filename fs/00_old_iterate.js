"use strict";

const console = require('../stdio.js').Get('fs/iterate', { minLevel: 'verbose' });	// debug verbose log
const inspect = require('../utility.js').makeInspect({ depth: 2, breakLength: 0 });
const promisifyMethods = require('../utility.js').promisifyMethods;
const util = require('util');
const _ = require('lodash');
const nodeFs = promisifyMethods(require('fs'));
const nodePath = require('path');
const Q = require('q');
Q.longStackSupport = true;
const getDevices = require('./devices.js');
const pathDepth = require('./path-depth.js');

// creates a POJO FS item to be used by iterate. Takes a path and returns an object containing path, stats, and fileType
module.exports = {

	createFsItem, iterate };

	function createFsItem(path, stats) {
		return ({
			path: /*nodePath.resolve*/(path),
			stats,
			get fileType() { return stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'unknown'; },
			get pathDepth() { return this.path.split(nodePath.sep).length - 1; },
			get extension() {
				var n = this.path.lastIndexOf('.');
				var n2 = Math.max(this.path.lastIndexOf('/'), this.path.lastIndexOf('\\'));
				return (n < 0 || (n2 > 0 && n2 > n)) ? '' : this.path.slice(n + 1);
			},
			[util.inspect.custom](depth, options) {
				return _.assign({}, this);
			}
		})	;
	};
	
	function iterate(options) {
		
		options = _.defaults(options, {
			path: '.',
			maxDepth: 1,
			queueMethod: 'shift',
			filter: undefined,
			// removePathPrefix: undefined,
			objectMode: true,
			highWaterMark: 16,
			handleError(err) {
				console.warn(`iterate: ${err}`);//${err.stack||err}`);
			}
		});
		console.verbose(`iterate(${inspect(options, { compact: true })})`);

		var root = nodePath.resolve(options.path);
		//var rootDepth: path.split(nodePath.sep).length - 1,
		var rootItem = null;
		var paths = [path];
		var errors = [];
		
		var self = new require('stream').Readable({
			
			objectMode: true,

			read: function (size) {

				return (function next() {

					if (!run.paths.length) {
						if (run.errors.length) {
							console.warn(`iterate('${run.root}'): stream end: ${run.errors.length} errors: ${run.errors.join('\n\t')}`);
						} else {
							console.debug(`iterate('${run.root}'): stream end`);
						}
						self.push(null);
						return 0;
					}
					var path = run.paths[options.queueMethod]();
					
					nodeFs.lstat(path)
					.then(stats => createFsItem(path, stats))
					.then(item => {
						if (path === run.root) {
							run.rootItem = item;
						}
						if (!options.filter || options.filter(item)) {
							var currentDepth = item.pathDepth; - run.rootItem.pathDepth/*run.rootDepth*/;	// +1 because below here next files are read from this dir
							if (item.fileType === 'dir' && ((options.maxDepth === 0) || (currentDepth <= options.maxDepth + run.rootItem.pathDepth/*run.rootDepth*/))/* && (!options.filter || options.filter(item))*/) {
								nodeFs.readdir(item.path).then(names => {
									// if (options.filter) names = names.filter(typeof options.filter !== 'function' ? name => name.match(options.filter): options.filter);
									console.debug(`${names.length} entries at depth=${currentDepth} in dir:${item.path} run.paths=[${run.paths.length}] item=${inspect(item)}`);
									_.forEach(names, name => run.paths.push(/*{ path:*/ nodePath.join(item.path, name)/*, dir: item, drive*/ /*}*/));
									/*return*/ self.push(item);
								}).catch(err => nextHandleError(err));
							} else {
								/*return*/ self.push(item);
							}
						}
					})
					.catch(err => nextHandleError(err));

					function nextHandleError(err) {
						options.handleError(err);
						run.errors.push(err);
						// process.nextTick(() =>
						 // run.emit('error', err);
						 // );
						return next();//1;
					}

				})();
			}
		})
		.on('close', (...args) => console.verbose(`iterate: close: ${inspect(args)}`))
		.on('end', (...args) => console.verbose(`iterate: end: ${inspect(args)}`))
		.on('error', (err, ...args) => console.warn(`iterate: err: ${err} ${inspect(args)}`));

		return self;
	}
// };
