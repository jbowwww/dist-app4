"use strict";
const debug = require('@jbowwww/log');//('index')
const inspect = require('./utility.js').makeInspect({ depth: 3, compact: true });
const util = require('util');
const { map } = require('@jbowwww/promise');
const clusterProcesses = require('@jbowwww/cluster-processes');

const app = require('./app.js');
const Disk = require('./model/filesys/disk.js');
const FsEntry = require('./model/filesys/filesys-entry.js');
const File = require('./model/filesys/file.js');
const Dir = require('./model/filesys/dir.js');
const Audio = require('./model/audio.js');

var searches = [
	{ path: '/home/jk/code/dist-app4', maxDepth: 0, progress: true },
	// { path: '/mnt/media', maxDepth:                   0, progress: true },
	// { path: '/mnt/mystuff', maxDepth: 0 }
	// { path: '/', maxDepth: 0, filter: dirEntry => (!['/proc', '/sys', '/lib', '/lib64', '/bin', '/boot', '/dev' ].includes(dirEntry.path)) }
];

(async function main() {
	try {
		await app.dbConnect();
		await clusterProcesses(

			async function populate () {
				await Disk.iterate();
				await map(searches, async search => {
					for await (const a of Dir.iterate(search)/*.asArtefacts()*/) {
						try {
							debug(`a: ${inspect(a)}`);
							a.save({ bulkSave: !!a.file })	// files can be bulk saved because they aren't referenced by anything else like Dirs are
						} catch (e) {
							debug(`warn for iterate: a=${inspect(a)}: ${e.stack||e}`);
						}
					}
				});
				app.logStats();
			},

			// TODO: Me next (above should theoretically be ok except need to code .asArtefacts query helper; probs need debugging/correcting)
			async function hash () {
				for await (const a of File.find({ hash: { $exists: false } }).asArtefact()) {	// move that part to a query method on File, and also transform the File doc instance to artefact like { file } or { dir }
					try {			// /*Limit({ concurrency: 1 },*/ async function (f) {
						await a.file
							.doHash();
						await a.save({ bulk: true });
					} catch (e) {
						debug(`warn for hash: a=${inspect(a)}: ${e.stack||e}`);
					}
				}
				app.logStats();			
			},

			async function populateAudio() {
				for await (const a of File.find({ path: /\.mp3/i }).asArtefact()) {					
					try {
							a.audio = await Audio.findOrCreate({ _artefactId: a.file._id });
							await a.save();	//bulkSave
					} catch (e) {
						debug(`warn for audio: f=${inspect(f)} ${e.stack||e}`);	
					}
				}
				app.logStats();
			}
		);
	} catch (err) {
		debug(`Overall cluster error: ${err.stack||err}`);
	}	
}) ();

