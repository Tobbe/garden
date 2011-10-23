var util = require('util');
var redis = require('redis');

exports.index = function(req, res) {
	var r = redis.createClient();
	r.hvals('repos:bb', function(err, reply) {
		if (err) {
			return res.send('Error fetching bb repos from database: ' + utils.inspect(err));
		}

		res.render('bbrepos', {
			title: 'Garden - BitBucket Repositories',
			dbg: util.inspect(reply),
			bbrepos: reply.map(JSON.parse),
			pretty: true
		});
	});
};

exports.show = function(req, res) {
	res.render('bbrepo', {
		title: 'Garden - ' + req.bbrepo.name,
		dbg: util.inspect(req.bbrepo),
		repo: req.bbrepo,
		pretty: true
	});
};

exports.load = function(reponame, callback) {
	var r = redis.createClient();

	r.hget('repos:bb', reponame, function(err, reply) {
		if (err) {
			return callback(err);
		}

		if (!reply) {
			return callback('No repository with name \'' + reponame + '\' found in the database');
		}

		return callback(null, JSON.parse(reply));
	});
};

