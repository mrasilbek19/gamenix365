// Read-only audit: node scripts/audit-currency.cjs /tmp/currency-audit.json [approved-prices.json]
// Optional prices produce a review plan only. No update/insert/delete/index operations.
const fs = require('fs');
const root = require('path').resolve(__dirname, '..');
const env = fs.existsSync(root + '/.env') ? require('dotenv').parse(fs.readFileSync(root + '/.env')) : {};
const { MongoClient } = require('mongoose').mongo;
(async () => {
	const uri = process.env.MONGO_DEV || env.MONGO_DEV;
	if (!uri) throw Error('Development database URI is not configured');
	const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, readPreference: 'primary' });
	try {
		await client.connect();
		const db = client.db();
		const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
		const report = {
			generatedAt: new Date().toISOString(),
			target: 'configured development database',
			readOnly: true,
			collections: {},
		};
		for (const name of ['products', 'order', 'orderItems', 'payments', 'paymentEvents']) {
			if (!names.includes(name)) {
				report.collections[name] = { count: 0, exists: false };
				continue;
			}
			const rows = await db
				.collection(name)
				.find(
					{},
					{
						projection: {
							_id: 1,
							productName: 1,
							productPrice: 1,
							currency: 1,
							productCurrency: 1,
							orderCurrency: 1,
							orderTotal: 1,
							orderDelivery: 1,
							itemPrice: 1,
							itemQuantity: 1,
							orderId: 1,
							amount: 1,
							amountMinor: 1,
							status: 1,
							provider: 1,
							createdAt: 1,
						},
					},
				)
				.toArray();
			report.collections[name] = {
				count: rows.length,
				withoutCurrency: rows.filter((r) => !r.currency).length,
				currencies: [...new Set(rows.map((r) => r.currency ?? 'UNMARKED_LEGACY_USD'))],
				records: rows,
			};
			console.log(
				name + ': ' + rows.length + ' records; currencies ' + JSON.stringify(report.collections[name].currencies),
			);
		}
		const output = process.argv[2];
		if (!output) throw Error('Pass an output JSON path; this audit never writes to MongoDB');
		const approvedFile = process.argv[3];
		if (approvedFile) {
			const approved = JSON.parse(fs.readFileSync(approvedFile, 'utf8'));
			const products = report.collections.products.records ?? [];
			report.proposedRepricing = products
				.filter((product) => Object.hasOwn(approved, String(product._id)))
				.map((product) => {
					const price = approved[String(product._id)];
					if (!Number.isSafeInteger(price) || price < 0)
						throw Error('Approved KRW prices must be nonnegative safe integers');
					if (product.currency === 'KRW') throw Error('Already-KRW product must not be included in legacy repricing');
					return {
						_id: product._id,
						expectedOldPrice: product.productPrice,
						expectedOldCurrency: product.currency ?? null,
						proposedCurrency: 'KRW',
						proposedPrice: price,
						action: 'PLAN_ONLY_REQUIRES_REVIEW',
					};
				});
			if (report.proposedRepricing.length !== Object.keys(approved).length)
				throw Error('Approval contains unknown product IDs');
		}
		fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
		console.log('Read-only audit saved; no database writes.');
	} finally {
		await client.close();
	}
})().catch((e) => {
	console.error('Read-only database audit failed:', e.name);
	process.exitCode = 1;
});
