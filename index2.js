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
const Artefact = require('./artefact.js');

var searches = [
	// { path: '/home/jk/code/dist-app4', maxDepth: 0, progress: true },
	{ path: '/mnt/media', maxDepth:                   0, progress: true },
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
					for await (const file of Dir.iterate(search)) {
						await Artefact(file).save()
					}
				});
				app.logStats();
			},

			async function hash () {
				for await (const file of File.find({ hash: { $exists: false } })) {
					await Artefact(file)
					.do(({ file }) => file.doHash());
				}
				app.logStats();			
			},

			async function populateAudio() {
				for await (const file of File.find({ path: /.*\.mp3/i })) {
					await Artefact(file)
					.with(Audio)
					.do(({ file, /*fs, dir,*/ audio }) => ({
						audio: 	// TODO: think: if could move the conditional part of below to query? then this becomes purely operation
						 ( !audio || file.isUpdatedSince(audio) )
						 ? 	Audio.fromFile(file)
						 : 	undefined
					}));
					app.logStats();
				}
			}

				// TODO: Test this syntax still?
				// await Artefact.pipe(
				// 	File.find({ path: /\.mp3/i }),
				// 	Audio,
				// 	async ({ file, audio }) => {
				// 		log.log(`artefact: ${inspect({ file, audio })}`);
				// 	}
				// );
				// app.logStats();

		);
	} catch (err) {
		debug(`Overall cluster error: ${err.stack||err}`);
	}	
}) ();

