"use strict";
const log = require('@jbowwww/log');//.disable('debug');
const inspect = require('../../utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const { promisifyMethods } = require('../../utility.js');
const _ = require('lodash');
const mongoose = require('mongoose');
const { map: promiseMap } = require('@jbowwww/promise');
const getDevices = require('../../fs/devices.js');
const { Partition } = require('./index.js');//mongoose.model('partition');// require('./partition.js');

let disk = new mongoose.Schema({
	name: { type: String, required: true },
	serial: { type: String, required: false }, //true, default: '' },
	model: { type: String, required: false }, //true, default: '' },
	label: { type: String, required: false }, //true, default: '' },
	uuid: { type: String, required: false }, //true, default: '' },
	size: { type: String, required: false }, //true, default: '' },
	vendor: { type: String, required: false }, //true, default: '' },
	// children: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'partition' }]
}, {
	// strict: false,
	defaultFindQuery: ['name', 'vendor', 'model', 'serial']//{ uuid: undefined }
});

disk.plugin(require('../plugin/standard.js'));
disk.plugin(require('../plugin/bulk-save.js'));
disk.plugin(require('../plugin/artefact.js'));
// disk.plugin(require('../plugin/stat.js'), [ 'iterate' ]);

disk.static('populate', async function iterate(task) {
		var model = this;
		var debugPrefix = `[model ${model.modelName}].populate()`;
		var dbOpt = { saveImmediate: false/* true*/ };
		
		const jsonDevices = await getDevices();
		log.debug(`${debugPrefix}: jsonDevices=${inspect(jsonDevices)}`);

		const disks = [];
		const partitions = [];

		try {
			await promiseMap(jsonDevices, async disk => {
				const diskDoc = await model.findOrCreate(disk, dbOpt);
				disks.push(diskDoc);
				log.debug(`diskDoc=${inspect(diskDoc)}`); // diskDoc=${inspect(diskDoc)} containerPartitionDoc=${inspect(containerPartitionDoc)} 
				await (async function mapPartitions(container, containerPartitionDoc) {
					return (!container || !container.children ? []
				 : 	await promiseMap(container.children, async partition => {
						partition = {
								...partition,
								disk: diskDoc,
								container: containerPartitionDoc
						};
						const partitionDoc = await Partition.findOrCreate(partition, dbOpt);
						partitions.push(partitionDoc);
						log.debug(`partitionDoc=${inspect(partitionDoc)}`); // diskDoc=${inspect(diskDoc)} containerPartitionDoc=${inspect(containerPartitionDoc)} 
						var mp = await mapPartitions(partition, partitionDoc);
						return mp;
					}))
				})(disk);
			});
			return { disks, partitions };
		} catch (e) {
				console.error(`disk.iterate: error: ${e.stack||e}`);
				model._stats.iterate.errors.push(e);
		}
});

disk.static('getDiskForPath', function getDiskForPath(path) {
	return this.find().then(disks => {
		var disk =_.find(_.sortBy(
				_.filter(disks, disk => typeof disk.mountpoint === 'string'),
				disk => disk.mountpoint.length ),
			disk => path.startsWith(disk.mountpoint));
		// log.debug(`disk=${inspect(disk)} disks=${inspect(disks)}`);
		return disk;
	});
})

module.exports = mongoose.model('disk', disk);
