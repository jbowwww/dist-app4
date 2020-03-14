"use strict";

const console = require('../../stdio.js').Get('model/fs/filesys', { minLevel: 'log' });	// log verbose debug
const inspect = require('../../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
// const _ = require('lodash');
// const Q = require('q');
// const { createFsItem, iterate } = require('../../fs/iterate.js');

// const { promisePipe, artefactDataPipe, writeablePromiseStream, chainPromiseFuncs, nestPromiseFuncs, ifPipe, conditionalTap, streamPromise }  = require('../../promise-pipe.js');

const mongoose = require('mongoose');

const Disk = require('./disk.js');
const Partition = require('./partition.js');
const FsEntry = require('./filesys-entry.js');
const Dir = require('./dir.js');
const File = require('./file.js');

// const Artefact = require('../../Artefact.js');

// const debug = function(msg = 'promiseFunc: val=') { return (val => { console.debug(`${msg}${val}`); return val; }); };

// module.exports.iterate = function fsIterate(options, ...promisePipeFuncs) {
// 	options = _.defaults(options, { searches: [], saveImmediate: false, concurrency: 8 });
// 	console.verbose(`fsIterate(options=${inspect(options, {depth: 3, compact:true})}), promisePipeFuncs=[\n\t${promisePipeFuncs.map(ppf => ppf.toString()).join('\n\t')} ]`);
// 	return Q.all(_.map(options.searches, search => createFsItem(search.path).then(debug())
// 		.then(searchRootDir => FsEntry.findOrCreate({ path: searchRootDir.path }, searchRootDir)).then(debug())
// 		.then(searchRootDirDoc => searchRootDirDoc.save()).then(debug())
// 		// .then(searchRootDirDoc => Artefact(searchRootDirDoc))
// 		// .tap(a => console.verbose(`a=${inspect(a)}`))
// 		.then(searchRootDirDoc => promisePipe(iterate(search), { concurrency: options.concurency },
// 			fs => FsEntry.findOrCreate({ path: fs.path }, fs, { saveImmediate: fs.fileType === 'dir' || options.saveImmediate }),
// 			fs => Artefact(fs),
// 			// a => a.dir || options.saveImmediate ? a/*.save()*/ : a.bulkSave(),			// saves at least directories immediately, because files may reference them 
// 			...promisePipeFuncs))
// 		.then(debug('fsIterate(${inspect(search, {compact:true})}) return: '))))
// 	.then(`Finished ${options.searches.length} searches`);
// };

module.exports.FsEntry = FsEntry;
module.exports.Disk = Disk;
module.exports.Dir = Dir;
module.exports.File = File;
module.exports.Partition = Partition;
