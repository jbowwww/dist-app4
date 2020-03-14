
"use strict";
const console = require('./stdio.js').Get('formatSizes', { minLevel: 'verbose' });	// debug verbose log
const inspect = require('./utility.js').makeInspect({ depth: 3, /*breakLength: 0,*/ compact: false });
const { promisifyMethods } = require('./utility.js');
const fs = promisifyMethods(require('fs'));
const _ = require('lodash');

module.exports = formatSizes;

// only specify propertyNames if v is an object. Can be an array as proeprtyNames[0] or array of strings for propertyNames
function formatSizes(v, ...propertyNames) {
	if (propertyNames.length === 1 && _.isArray(propertyNames[0])) {
		propertyNames = propertyNames[0];
	}
	if (propertyNames.length > 0 && (!(_.every(propertyNames, pn => typeof pn === 'string')))) {
		throw new TypeError(`propertyNames must be an array of strings`);
	}
	if (_.isPlainObject(v)) {
		return _.mapValues(v, (value, key) => propertyNames.length === 0 || propertyNames.includes(key) ? formatSizes(value) : value);
	} else if (_.isFinite(v)) {
		const suffixes = [ '', 'k', 'm', 'g', 't' ];
		let pwr = 0;
		for (var f = v; f >= 1024; f /= 1024) {
			pwr++
			console.debug(`formatSizes: v=${v} f=${f} pwr=${pwr} suffix[pwr]=${suffixes[pwr-1]}`);
		}
		v = f;
		// for (var pwr = 1; v > 1024**pwr; pwr++) {
		// 	console.verbose(`formatSizes: v=${v} pwr=${pwr} suffix[pwr]=${suffixes[pwr-1]}`);
		// }

		return '' + (v /*/ pwr*/).toFixed(1) + suffixes[pwr];
	} else {
		throw new TypeError(`formatSizes: typeof v = '${typeof v}'`);
	}
}
