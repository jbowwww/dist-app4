/* 180926 : dist-app3
 * Another re-write, where artefact types are each in their own table
 * This should hopefully avoid the difficulty and awkardness related to static member functions and data properties on embedded document schemas. 
 */

"use strict";
const console = require('./stdio.js').Get('index6', { minLevel: 'verbose' });	// debug verbose log
const inspect = require('./utility.js').makeInspect({ depth: 3, /*breakLength: 0,*/ compact: false });
const _ = require('lodash');

const app = require('./app.js');
const formatSizes = require('./format-sizes.js');

// const FileSys = require('./model/filesys');
const Disk = require('./model/filesys/disk.js');
const FsEntry = require('./model/filesys/filesys-entry.js');
const File = require('./model/filesys/file.js');
const Dir = require('./model/filesys/dir.js');
const Audio = require('./model/audio.js');
// const Artefact = require('./Artefact.js');

(async function main() {
	try {
		
		await app.dbConnect();
		
		let totals = {
			groupCount: 0,
			fileCount: 0,
			totalSize: 0,
			totalGroupSize: 0
		};

		let cursor = await File.aggregate([		 /* , path: /^\/mnt\/wheel\/Trapdoor\/media\/.*$/ } */
			{ $match: { hash: { $exists : 1 }, deletedAt: { $exists: 0 }, 'stats.size': { $gt: 1024*1024 } } },
			{ $group : { '_id':{'size': '$stats.size', 'hash': '$hash'}, paths: { $push: "$path" }, groupSize: { $sum: "$stats.size" }, count: { $sum: 1 } } },
			{ $match: { count: { $gt: 1 } } }
		])/*.cursor({ batchSize: 20 }).exec()*/;
		console.verbose(`cursor = ${inspect(cursor)} + \n${_.functions(cursor).join(', ')}`);
		
		for await (const f of cursor) {			//await cursor.eachAsync(processFile)
			console.verbose(`f=${inspect(f)}`);
			
			totals.groupCount++;
			totals.fileCount += f.count;
			totals.totalSize += f._id.size;
			totals.totalGroupSize += f.groupSize;
			
			try {
				await f.getArtefact(async a => { 	//	const a = await f.getArtefact();
					if (a.file && (!a.file.hash || !a.file.stats || (a.file.stats.mtime && !a.file.isCheckedSince(a.file.stats.mtime)))) {
						await a.file.doHash();
						await a.bulkSave();
					}
				});
			} catch (e) {
				console.warn(`error on file '${f.path||'(undef)'}': ${e.stack||e}`);
			}
		}

		console.log(`totals = ${inspect(formatSizes(totals))}`);

	} catch (err) {
		console.error(`Other error: ${err.stack||err}`);
	} finally {
		await app.quit();
	}
})();

// .then(() => promisePipe(promisePipeOptions,
// 	File.find({ hash: { $exists: false } }).cursor(),
// 	f => f.getArtefact(),
// 	pipelines.doHash,
// 	pipelines.debug,
	// pipelines.bulkSave))

// .then(async function() {
// 	for await (const f of File.find({ hash: { $exists: false } }).cursor()) {
// 		await pipelines.doAudio(f);
// 		await pipelines.bulkSave(f);
// 	}
// })


// .then(doStats)
// .then(doCloseDb);
