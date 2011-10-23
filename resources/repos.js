var util = require('util');
var redis = require('redis');

exports.index = function(req, res) {
	var r = redis.createClient();
	var ghRepos = null;
	var bbRepos = null;
	r.hvals('repos:gh', function(err, reply) {
		if (err) {
			return res.send('Error fetching gh repos from database: ' + utils.inspect(err));
		}

		ghRepos = reply.map(JSON.parse);
		console.log(ghRepos);
		gotRepos();
	});

	r.hvals('repos:bb', function(err, reply) {
		if (err) {
			return res.send('Error fetching bb repos from database: ' + utils.inspect(err));
		}

		bbRepos = reply.map(JSON.parse);
		console.log(bbRepos);
		gotRepos();
	});

	function gotRepos() {
		gotRepos.count = gotRepos.count + 1 || 1;

		if (gotRepos.count == 2) {
			res.render('repos', {
				title: 'Garden - Repositories',
				dbg: util.inspect([ghRepos, bbRepos]),
				ghrepos: ghRepos,
				bbrepos: bbRepos,
				pretty: true
			});
		}
	}
};

