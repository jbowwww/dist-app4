
const pipe = Object.assign( 
	async function*(...args) {
		return yield* args.reduce((val, acc) => val(accum), undefined)();
	},

	{
		async* merge(...sources) {
			const sourceMap = new WeakMap();
			const abort = false;
			let totalItems = 0;
			while (!abort) {
				for (const source of sources) {
					if (!sourceMap.has(source)) {
						sourceMap.add(source, Promise.resolve(source.next()).then(() => sourceMap.delete(source)));
					}
				}
				const data = await Promise.race(sourceMap);
				totalItem++;
				if (!data.done) yield data;
				else {
					sources.remove(source);
					if (sources.length === 0)
						abort = true;
				}
			}
		},
		duplicate() {

		}
	}
);
