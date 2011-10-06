var util = require('util');
var redis = require('redis');
var GitHubRepoFetcher = require('../github.js').GitHubRepoFetcher;

exports.index = function(req, res) {
	var r = redis.createClient();
	r.hvals('users', function(err, reply) {
		if (err) {
			return res.send('Error fetching users from database: ' + utils.inspect(err));
		}

		res.render('users', {
			title: 'Garden - Users',
			dbg: util.inspect(reply),
			users: reply.map(JSON.parse),
			auth: req.session.auth,
		});
	});
};

exports.new = function(req, res) {
	res.render('new_user', {
		title: 'Garden - New User',
	});
};

exports.show = function(req, res) {
	res.render('user', {
		title: 'Garden - ' + req.user.full_name,
		dbg: util.inspect(req.user),
		user: req.user,
	});

	/*getReposFromGitHub(req.user.user_name, 'bagucode', function(err, repos) {
		addReposToDb(req.user.user_name, repos, function() {
			console.log('all repos added to db! All done!');
		});
	});*/
};

exports.create = function(req, res) {
	if (!req.body.user_name || !req.body.password || !req.body.password[0] || !req.body.password[1]) {
		return res.send('Missing user name or password');
	}

	if (req.body.password[0] != req.body.password[1]) {
		return res.send('Passwords didn\'t match');
	}

	req.body.password = req.body.password[0];
	req.body.salt = Date.now();
	req.body.password_hash = req.body.salt + '_' + req.body.password;
	
	var r = redis.createClient();
	r.hsetnx('users', req.body.user_name, JSON.stringify(req.body), function(err, result) {
		if (err) {
			return res.send('Error adding user to redis: ' + util.inspect(err), 500);
		}

		if (result === 0) {
			return res.send('Username already taken');
		}

		res.send('user created');
	});
};

exports.edit = function(req, res) {
	res.render('edit_user', {
		title: 'Garden - Edit ' + req.user.full_name,
		dbg: util.inspect(req.user),
		user: req.user,
	});
};

exports.update = function(req, res) {
	if (req.body.update_ghrepos) {
		if (!req.body.gh) {
			res.local('error', 'no gh name');
			return exports.edit(req, res);
		}

		getReposFromGitHub(req.body.user_name, req.body.gh, function(err, repos) {
			addReposToDb(req.user.user_name, repos, function() {
				console.log('all repos added to db! All done!');
				res.redirect('/users/' + req.user.user_name);
			});
		});
	} else if (req.body.update_user) {
		if (!req.body.password || !req.body.password[0] || !req.body.password[1]) {
			return res.send('Missing password');
		}

		if (req.body.password[0] != req.body.password[1]) {
			return res.send('Passwords didn\'t match');
		}

		req.body.password = req.body.password[0];
		
		var r = redis.createClient();
		r.hset('users', req.body.user_name, JSON.stringify(req.body), function(err, result) {
			if (err) {
				return res.send('Error adding user to redis: ' + util.inspect(err), 500);
			}

			if (result === 0) {
				return res.send('Username already taken');
			}

			res.redirect('/users/' + req.user.user_name);
		});
	}
};

function getReposFromGitHub(garden_username, gh_username, callback) {
	var github = new GitHubRepoFetcher();
	github.on('basic_repos', function(repos) { });

	github.on('fetching_readmes', function(readmesToFetch) {
		getReposFromGitHub.readmesToFetch = readmesToFetch;
		console.log('Fetching ' + readmesToFetch + ' readmes');
	});

	github.on('repo_complete', function(repo) {
		getReposFromGitHub.completedRepos = getReposFromGitHub.completedRepos + 1 || 1;
		completed = getReposFromGitHub.completedRepos;
		totalRepos = getReposFromGitHub.readmesToFetch;
		if (totalRepos) {
			console.log('Completed ' + completed + ' repo(s) out of ' + totalRepos);
		}
	});

	github.on('end', function(repos) {
		console.log('all repos fetched!');
		getReposFromGitHub.readmesToFetch = undefined;
		getReposFromGitHub.completedRepos = undefined;
		repos.map(function(repo) {
			repo.garden_user = garden_username;
			return repo;
		});
		callback(null, repos);
	});

	console.log('Fetching GH repos for ' + gh_username);

	github.userRepos(gh_username);
}

function addReposToDb(username, repos, callback) {
	if (!repos || repos.length === 0) {
		console.log('added all repos to db');
		return callback();
	}

	var r = redis.createClient();
	var count = repos.length;
	repos.forEach(function(repo) {
		r.hset('repos:gh', repo.name, JSON.stringify(repo), function(err, result) {
			if (err) {
				console.log('Error!');
				return console.log(err);
			}

			count--;

			if (count === 0) {
				console.log('added all repos to repos:gh:');
				addedRepos();
			}
		});
	});

	
	var repoNames = [];
	repos.forEach(function(repo) {
		repoNames.push(repo.name);
	});
		
	r.hget('users', username, function(err, result) {
		var user = JSON.parse(result);

		user.ghRepos = repoNames;
		console.log(user);

		r.hset('users', username, JSON.stringify(user), function(err, result) {
			console.log('added all repos to the user, ' + username);
			addedRepos();
		});
	});

	function addedRepos() {
		addedRepos.count = addedRepos.count + 1 || 1;

		if (addedRepos.count == 2) {
			return callback();
		}
	}
}

exports.load = function(username, callback) {
	var r = redis.createClient();

	r.hget('users', username, function(err, reply) {
		if (err) {
			return callback(err);
		}

		if (!reply) {
			return callback('No user with name \'' + username + '\' found in the database');
		}

		var fullRepoInfo = [];
		var user = JSON.parse(reply);
		user.ghRepos = user.ghRepos || [];
		var reposToGo = user.ghRepos.length;
		user.ghRepos.forEach(function(repo) {
			r.hget('repos:gh', repo, function(err, reply) {
				fullRepoInfo.push(JSON.parse(reply));
				reposToGo--;
				if (reposToGo === 0) {
					user.ghRepos = fullRepoInfo;
					console.log(user);
					callback(null, user);
				}
			});
		});

		if (reposToGo === 0) {
			callback(null, user);
		}
	});
};

function getReposFromBitBucket(username, callback) {
	var https = require('https');

	var options = {
		host: 'api.bitbucket.org',
		path: '/1.0/users/' + username
	};

	https.get(options, function(response) {
		response.setEncoding('utf8');

		var data = '';
		response.on('data', function(chunk) {
			data += chunk;
		});

		response.on('end', function() {
			data = JSON.parse(data);
			unifiedRepoInfoBB(username, data.repositories, callback);
		});
	});
}

function unifiedRepoInfoBB(username, repos, callback) {
	var unifiedRepos = [];
	var toGo = repos.length;

	repos.forEach(function(repo) {
		var unifiedRepo = {};
		unifiedRepo.name = repo.name;
		unifiedRepo.description = repo.description;

		getBBReadme(username, repo.slug, function(err, readme) {
			unifiedRepo.readme = readme;
			unifiedRepos.push(unifiedRepo);
			toGo--;

			if (toGo === 0) {
				callback(null, unifiedRepos);
			}
		});
	});
}

function getBBReadme(user, repoSlug, callback) {
	var https = require('https');

	var options = {
		host: 'api.bitbucket.org',
		path: '/1.0/repositories/' + user + '/' + repoSlug + '/src/tip/'
	};

	https.get(options, function(response) {
		response.setEncoding('utf8');

		var data = '';
		response.on('data', function(chunk) {
			data += chunk;
		});

		response.on('end', function() {
			data = JSON.parse(data);

			var readmePath = getBBReadmePath(data.files);
			if (readmePath) {
				getBBReadmeContent(user, repoSlug, readmePath, function(err, content) {
					if (err) {
						return callback(err);
					}

					return callback(null, {name: readmePath, content: content});
				});
			} else {
				callback(null, {name: '', content: ''});
			}
		});
	});
}

function getBBReadmePath(files) {
	for (var i = 0; i < files.length; ++i) {
		if (files[i].path.match(/^readme\b/i)) {
			return files[i].path;
		}
	}
}

function getBBReadmeContent(user, repoSlug, readmePath, callback) {
	var https = require('https');

	var options = {
		host: 'api.bitbucket.org',
		path: '/1.0/repositories/' + user + '/' + repoSlug + '/src/tip/' + readmePath
	};

	https.get(options, function(response) {
		response.setEncoding('utf8');

		var data = '';
		response.on('data', function(chunk) {
			data += chunk;
		});

		response.on('end', function() {
			data = JSON.parse(data);
			return callback(null, data.data);
		});
	});
}

