"use strict";

const console = require('../stdio.js').Get('fs/devices', { minLevel: 'log' });	// debug verbose log
const inspect = require('../utility.js').makeInspect({ depth: 2, breakLength: 0 });
const util = require('util');
const _ = require('lodash');
const exec = util.promisify(require('child_process').exec)

// module.exports = function getDevices() {
// 	return exec('lsblk -JO').then(({ stdout, stderr }) => {
// 		console.verbose(`stdout = ${stdout}`);
// 		const devices = JSON.parse(stdout).blockdevices;
// 		console.verbose(`getDevices(): devices = ${inspect(devices)}`);
// 		return devices;
// 	})
// 	.catch(e => {
// 		console.error(`error: ${e.stack||e.message||e}`);
// 		process.nextTick(() => { throw e; });
// 	});
// };

module.exports = async function getDevices() {
	try {
		const { stdout, stderr } = await exec('lsblk -JO');
		console.verbose(`stdout = ${stdout}`);
		const devices = JSON.parse(stdout).blockdevices;
		console.verbose(`getDevices(): devices = ${inspect(devices)}`);
		return devices;
	} catch (e) {
		console.error(`error: ${e.stack||e.message||e}`);
		process.nextTick(() => { throw e; });
	}
};
