var util = require('util');
var redis = require('redis');

exports.index = function(req, res) {
	var r = redis.createClient();
	r.hvals('repos:gh', function(err, reply) {
		if (err) {
			return res.send('Error fetching gh repos from database: ' + utils.inspect(err));
		}

		res.render('ghrepos', {
			title: 'Garden - GitHub Repositories',
			dbg: util.inspect(reply),
			ghrepos: reply.map(JSON.parse),
			pretty: true
		});
	});
};

exports.show = function(req, res) {
	res.render('ghrepo', {
		title: 'Garden - ' + req.ghrepo.name,
		dbg: util.inspect(req.ghrepo),
		repo: req.ghrepo,
		pretty: true
	});
};

exports.load = function(reponame, callback) {
	var r = redis.createClient();

	r.hget('repos:gh', reponame, function(err, reply) {
		if (err) {
			return callback(err);
		}

		if (!reply) {
			return callback('No repository with name \'' + reponame + '\' found in the database');
		}

		return callback(null, JSON.parse(reply));
	});
};

