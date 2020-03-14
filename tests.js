
const debug = require('debug')('index');
const iterPipe = require('@jbowwww/iter-pipe');
const promisePipe = require('@jbowwww/promise-pipe');
// const fsIterate = require('@jbowwww/fsIterate');
const {inspect} = require('util');

const arr = [async function* (iter) {
		for await (i of iter) {
			console.log(`i=${i}`);
			yield i*2;
		}
	},
	i => console.log(`i2=${i}`)];

(async function() {
	const pipe = await iterPipe(
	// [1,2,3],
	...arr
);
	const r = await pipe(1,2,3)
	console.log(`arr=${inspect(arr)}, iterPipe(arr)=${/*inspect*/(pipe).toString()}, r=${inspect(r)}`);

const arr2 = [
	async a => await a*2,
	async b => '' + await b + ' bye'];
	const pipe2 = await promisePipe(
	[1,2,3],
	...arr2
);
	const r2 = typeof pipe2 === 'function' ? await pipe2(3) : pipe2;
	console.log(`arr2=${inspect(arr2)}, promisePipe(arr2)=${/*inspect*/(pipe2).toString()}, r2=${inspect(r2)}`);

})();