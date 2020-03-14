"use strict";
const console = require('../../stdio.js').Get('model/filesys/partition', { minLevel: 'log' });	// log verbose debug
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const inspectPretty = require('../../utility.js').makeInspect({ depth: 2, compact: false });
const util = require('util');
const _ = require('lodash');
const Q = require('q');
const mongoose = require('mongoose');

let partition = new mongoose.Schema({
	disk: { type: mongoose.SchemaTypes.ObjectId, ref: 'disk', required: true },				// the disk containing this partition/partition
	container: { type: mongoose.SchemaTypes.ObjectId, ref: 'partition', required: false },		// container partition (e.g. LVM)
	name: { type: String, required: true },													// partition name
	fstype: { type: String, required: true },												// filesystem type
	label: { type: String, required: false, default: '' },									// filesystem label
	uuid: { type: String, required: true, default: '' },									// filesystem(?) uuid
	parttype: { type: String, required: false, default: '' },								// partition type
	partlabel: { type: String, required: false, default: '' },								// partition label
	partuuid: { type: String, required: false },											// partition UUID
	mountpoint: { type: String, required: false },											// parttion mountpoint
	size: { type: String, required: true },													// partition size
}, {
	defaultFindQuery: [ 'name', 'uuid' ]
});


partition.plugin(require('../plugin/standard.js'));
partition.plugin(require('../plugin/bulk-save.js'));
partition.plugin(require('../plugin/artefact.js'));

function diskNameFromPartition(diskName) {
	if (typeof diskName === 'string') {
		for (var i = diskName.length; i > 0; i--) {
			if (_.isNumber(diskName[i - 1])) {
				diskName = diskName.slice(i - 1, 1);
			}
		}
	}
};

partition.post('construct', function construct(partition) {
	var model = this;
	const Disk = mongoose.model('disk');
	return Q(partition.disk instanceof mongoose.Document ? null
	 : 	Disk.findOrCreate({ name: diskNameFromPartition(partition.name) })
		.then(disk => _.set(partition, 'disk', disk)))
	.then(() => { console.verbose(`[model ${model.modelName}].post('construct'): name='${partition.name}' disk=${partition.disk}`) })
	.catch(err => { this.constructor._stats.errors.push(err); throw err; });
});


partition.static('findOrPopulate', function findOrPopulate() {
	return partitions()
	.then(partitions => partitionsDetail(partitions)
		.tap(disks => console.verbose(`partitions=${inspect(partitions)} disks=${inspect(disks)}`))
		.then(disks => Q.all(_.map(_.uniqBy(disks, 'mountpoint'), disk =>
			this.findOrCreate({ mountpoint: disk.mountpoint }, disk)
			.then(disk => disk./*save*/ bulkSave() )))))
	.catch(err => { console.error(`partition.on('init').partitions: error: ${err.stack||err}`); throw err; });
});

partition.static('getPartitionForPath', function getPartitionForPath(path) {
	return this.find().then(partitions => {
		var partition =_.find( _.sortBy( partitions, partition => partition.mountpoint.length ), partition => path.startsWith(partition.mountpoint));
		console.verbose(`partition=${inspect(partition)} partitions=${inspect(partitions)}`);
		return partition;
	});
});

module.exports = mongoose.model('partition', partition);
