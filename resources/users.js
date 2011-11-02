var util = require('util');
var redis = require('redis');
var GitHubRepoFetcher = require('../github.js').GitHubRepoFetcher;
var BitBucketRepoFetcher = require('../bitbucket.js').BitBucketRepoFetcher;

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
	if (req.query['google'] == 'google') {
		res.render('new_user_google', {
			title: 'Garden - New User',
			email: req.query['email']
		});
	} else {
		res.render('new_user', {
			title: 'Garden - New User',
		});
	}
};

exports.show = function(req, res) {
	res.render('user', {
		title: 'Garden - ' + req.user.full_name,
		dbg: util.inspect(req.user),
		user: req.user,
	});

	/*getReposFromBitBucket(req.user.user_name, 'haard', function(err, repos) {
		console.log('exports.show: got all repos');
		console.log('repo count: ' + repos.length);
		console.log(repos);
		//addReposToDb(req.user.user_name, repos, function() {
		//	console.log('all repos added to db! All done!');
		//});
	});*/
};

exports.create = function(req, res) {
	if (!req.body) {
		return res.send('Broken request', 500);
	}

	if (!req.body.email) {
		return res.send('Missing email address');
	}

	if (!req.body.full_name) {
		return res.send('Missing full name');
	}

	if (req.body.google && req.body.google == 'google') {
		create_google(req, res);
	} else {
		create_regular(req, res);
	}
};

function create_google(req, res) {
	req.body.google = true;
	add_user(req, res);
}

var generateUsername = (function() {
	var usernames = null;
	var name = '';
	var i = 0;
	var number = 2;

	return function(full_name) {
		if (full_name != name) {
			name = full_name;
			i = 0;
			number = 2;
			usernames = generateUsernames(full_name);
		}

		var username = '';
		if (i < usernames.length) {
			username = usernames[i];
			i++;
		} else {
			username = usernames[0] + number;
			number++;
		}

		return username;
	}
})();

function generateUsernames(full_name) {
	var names = full_name.toLowerCase().split(' ');
	var first = names[0];
	var last = '';
	var middle = '';

	if (names.length > 1) {
		last = names[names.length - 1];
	}

	if (names.length > 2) {
		middle = names.slice(1, names.length - 1);
		middle = middle.reduce(function(a, b) {
			return a + b[0];
		}, '');
	}

	if (middle && last) {
		return [
			first,
			first + middle,
			last,
			first[0] + last,
			first[0] + middle + last,
			first.substr(0, 2) + last.substr(0, 2),
			first.substr(0, 3) + last.substr(0, 3),
			first + last,
			first + middle + last];
	} else if (last) {
		return [first, last, first[0] + last, first.substr(0, 2) + last.substr(0, 2), first.substr(0, 3) + last.substr(0, 3), first + last];
	} else {
		return [first, first[0] + last, first.substr(0, 2) + last.substr(0, 2), first.substr(0, 3) + last.substr(0, 3), first + last];
	}
}

function create_regular(req, res) {
	if (!req.body.password || !req.body.password[0] || !req.body.password[1]) {
		return res.send('Missing password');
	}

	if (req.body.password[0] != req.body.password[1]) {
		return res.send('Passwords didn\'t match');
	}

	req.body.password = req.body.password[0];
	req.body.salt = Date.now();
	req.body.password_hash = req.body.salt + '_' + req.body.password;

	add_user(req, res);
}

function add_user(req, res) {
	var r = redis.createClient();

	req.body.user_name = generateUsername(req.body.full_name);

	r.hsetnx('users', req.body.user_name, JSON.stringify(req.body), function(err, result) {
		if (err) {
			return res.send('Error adding user to redis: ' + util.inspect(err), 500);
		}

		if (result === 0) {
			return add_user(req, res);
		}

		r.set('emailusermap:' + req.body.email, req.body.user_name, function(err, result) {
			if (err) {
				return res.send('Error adding user to emailusermap: ' + util.inspect(err), 500);
			}

			res.redirect('/users/' + req.body.user_name);
		});
	});
}

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
			addReposToDb(req.user.user_name, 'gh', repos, function() {
				console.log('all repos added to db! All done!');
				res.redirect('/users/' + req.user.user_name);
			});
		});
	} else if (req.body.update_bbrepos) {
		if (!req.body.bb) {
			res.local('error', 'no bb name');
			return exports.edit(req, res);
		}

		getReposFromBitBucket(req.body.user_name, req.body.bb, function(err, repos) {
			addReposToDb(req.user.user_name, 'bb', repos, function() {
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

function getReposFromBitBucket(garden_username, bb_username, callback) {
	var bitbucket = new BitBucketRepoFetcher();
	bitbucket.on('basic_repos', function(repos) { });

	bitbucket.on('fetching_readmes', function(readmesToFetch) {
		getReposFromBitBucket.readmesToFetch = readmesToFetch;
		console.log('Fetching ' + readmesToFetch + ' readmes');
	});

	bitbucket.on('repo_complete', function(repo) {
		getReposFromBitBucket.completedRepos = getReposFromBitBucket.completedRepos + 1 || 1;
		completed = getReposFromBitBucket.completedRepos;
		totalRepos = getReposFromBitBucket.readmesToFetch;
		if (totalRepos) {
			console.log('Completed ' + completed + ' repo(s) out of ' + totalRepos);
		}
	});

	bitbucket.on('end', function(repos) {
		console.log('all repos fetched!');
		getReposFromBitBucket.readmesToFetch = undefined;
		getReposFromBitBucket.completedRepos = undefined;
		repos.map(function(repo) {
			repo.garden_user = garden_username;
			return repo;
		});
		callback(null, repos);
	});

	console.log('Fetching BB repos for ' + bb_username);

	bitbucket.userRepos(bb_username);
}

function addReposToDb(username, reposPrefix, repos, callback) {
	if (!repos || repos.length === 0) {
		console.log('added all repos to db');
		return callback();
	}

	var r = redis.createClient();
	var count = repos.length;
	repos.forEach(function(repo) {
		r.hset('repos:' + reposPrefix, repo.name, JSON.stringify(repo), function(err, result) {
			if (err) {
				console.log('Error!');
				return console.log(err);
			}

			count--;

			if (count === 0) {
				console.log('added all repos to repos:' + reposPrefix);
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

		user[reposPrefix + 'Repos'] = repoNames;
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

		var user = JSON.parse(reply);

		user.ghRepos = user.ghRepos || [];
		user.bbRepos = user.bbRepos || [];

		if (user.ghRepos.length === 0) {
			reposDone();
		} else {
			var fullGHRepoInfo = [];
			var ghReposToGo = user.ghRepos.length;

			user.ghRepos.forEach(function(repo) {
				r.hget('repos:gh', repo, function(err, reply) {
					fullGHRepoInfo.push(JSON.parse(reply));
					ghReposToGo--;
					if (ghReposToGo === 0) {
						user.ghRepos = fullGHRepoInfo;
						reposDone();
					}
				});
			});
		}

		if (user.bbRepos.length === 0) {
			reposDone();
		} else {
			var fullBBRepoInfo = [];
			var bbReposToGo = user.bbRepos.length;

			user.bbRepos.forEach(function(repo) {
				r.hget('repos:bb', repo, function(err, reply) {
					fullBBRepoInfo.push(JSON.parse(reply));
					bbReposToGo--;
					if (bbReposToGo === 0) {
						user.bbRepos = fullBBRepoInfo;
						reposDone();
					}
				});
			});
		}

		function reposDone() {
			reposDone.count = reposDone.count + 1 || 1;

			if (reposDone.count == 2) {
				console.log(user);
				return callback(null, user);
			}
		}
	});
};

