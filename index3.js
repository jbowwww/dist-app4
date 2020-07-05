"use strict";
const log = require('@jbowwww/log').disable('debug');//('index')
const inspect = require('./utility.js').makeInspect({ depth: 3, compact: true });
const util = require('util');
const { map: promiseMap } = require('@jbowwww/promise');
const clusterProcesses = require('@jbowwww/cluster-processes');

const app = require('./app.js');
const Disk = require('./model/filesys/disk.js');
const Partition = require('./model/filesys/partition.js');
const FsEntry = require('./model/filesys/filesys-entry.js');
const File = require('./model/filesys/file.js');
const Dir = require('./model/filesys/dir.js');
const Audio = require('./model/audio.js');
const Artefact = require('./artefact.js');

var searches = [
	// { path: '/home/jk/code/dist-app4', maxDepth: 0, progress: true },
	{ path: '/mnt/Trapdoor/media/image', maxDepth: 0, progress: true },
	// { path: '/mnt/mystuff', maxDepth: 0 }
	// { path: '/', maxDepth: 0, filter: dirEntry => (!['/proc', '/sys', '/lib', '/lib64', '/bin', '/boot', '/dev' ].includes(dirEntry.path)) }
];

(async function main() {
	try {

		await app.dbConnect();
		await clusterProcesses(

			// async function findV1Files() {
			// 	for await (const v1group of
			// 		File.aggregate()
			// 		.match({ path: /.*\.v1/i })
			// 		.lookup({
			// 			from: "fs",
			// 			localField: "hash",
			// 			foreignField: "hash",
			// 			as: 'groupMatches'
			// 		 })
			// 		.group({ _id: { path: '$path', hash: '$hash' }, count: { $sum: 1 }, dupes: { $push: '$root' }}))
			// 	{
			// 		log.info(`v1 group: ${inspect(v1group)}`);
			// 		// await Artefact(file)
			// 		// .where({ hash: { $ne: null }})
			// 		// .groupBy({ hash: 1 })
			// 		// .do (({ file }) => {
			// 		// 	if (file.hash) ;
			// 		// });
			// 	}
			// 	app.logStats();
			// },

			async function populate (/*{ includeDisks } = { includeDisks: true }*/) {
				log.info(`Iterating disks...`);
				const { disks, partitions } = await Disk.iterate();
				log.verbose(`${disks.length} disks, ${partitions.length} partitions`);
				log.info('Starting directory searches...');
				/// TODO: spawn separate process (per partition) with some IPC (serachesForDisk) per promise/process/partition
				/// TODO: Or, separate into component files
				await promiseMap( await Partition.find().mounted(), async partition => {
					log.info(`Checking if partition is mounted for partition=${inspect(partition)}`);
					const searchesForDisk = searches.filter(search => search.path.startsWith(partition.mountpoint));
					log.info(`Starting ${searchesForDisk.length} searches on partition at \'${partition.mountpoint}\'`);
					for (const search of searchesForDisk) {
						log.info(`Started search for path \'${search.path}\'`);
						for await (const file of Dir.iterate(search)) {
							await Artefact(file).save();
						}
						app.logStats();
						log.info(`Finished search for path \'${search.path}\'`);
					}
					log.info(`Finished all searches on partition at \'${partition.mountpoint}\'`);
				});
				log.info('Finished all searches for all disks');
				app.logStats();
			},

			async function hash () {	// v- wrao the task's (this case hash's) base query ie .find({hash:{exists:false}}
										// with something like task.progress() and a 2nd parameter is the query to count
										// number of documents total this task will process i.e. in this case and
										// would be the right default parameter value: simply an empty .find({})
										// if you were only hashing mp3s both ,find() base query and total count query
										// would both include {path:/xxx.?/i} or something but diff would be hash: $exists
										// that is obviously the exact property the pipeline below sets, is that another
										// useful abstraction or just superfluous or perhaps just your use cases are simple
										// at this "early" stage
										// 299402
				for await (const file of File.find({ hash: { $exists: false } }).noCursorTimeout()) {
					await Artefact(file).do(
						// Eitjer need this await on doHash() or hash should become it's own aspect type so that do() will await it
						async ({ file }) => ({ file: await file.doHash() })
					);
					app.logStats();
				}
				app.logStats();
			},

			async function populateAudio() {
				/// TODO: Only issue with this new syntax is returning new aspects of Artefacts - e.g. below doesn't add an 'audio' to the artefact therefore nor save one
				for await (let { file, audio } of 
					Artefact(
						File.find({ path: /.*\.mp3/i }),
						Audio )) {
					if (!audio || file.isUpdatedSinc e(audio))
						audio = await Audio.loadMetadata(file);
				}
				// 	app.logStats();
				// }
				app.logStats();
			}


			// async function populateAudio() {
			// 	for await (const file of Artefact.find(
			// 			{ path: /.*\.mp3/i })) {
			// 		await Artefact(file).with(Audio).do(
			// 			({ file, audio }) => ({ audio: 	// TODO: think: if could move the conditional part of below to query? then this becomes purely operation
			// 			 ( !audio || file.isUpdatedSince(audio) )
			// 			 ? 	Audio.loadMetadata(file) : audio
			// 		}));
			// 		app.logStats();
			// 	}
			// }

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
		log(`Overall cluster error: ${err.stack||err}`);
	}	
}) ();

