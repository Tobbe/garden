var EventEmitter = require('events').EventEmitter;
var util = require('util');

function BitBucketRepoFetcher() {
	EventEmitter.call(this);
}
util.inherits(BitBucketRepoFetcher, EventEmitter);

exports.BitBucketRepoFetcher = BitBucketRepoFetcher;

BitBucketRepoFetcher.prototype.userRepos = function(username) {
	this._getUserRepos(username, function(err, bbRepos) {
		this._unifiedRepoInfo(username, bbRepos, function(repos) {
			this.emit('end', repos);
		}.bind(this));
	}.bind(this));
}

BitBucketRepoFetcher.prototype._getUserRepos = function(username, callback) {
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
			callback(null, data.repositories);
		});
	});
}

///
// The format is
// {
//   "name": <repo name>,
//   "description": <shortish description of repo>,
//   "readme": {
//     "name": <filename of readme file>,
//     "content": <readme text>
//   }
// }
BitBucketRepoFetcher.prototype._unifiedRepoInfo = function(username, repos, callback) {
	var unifiedRepos = [];
	var toGo = repos.length;

	repos.forEach(function(repo) {
		var unifiedRepo = {};
		unifiedRepo.name = repo.name;
		unifiedRepo.description = repo.description;
		unifiedRepos.push(unifiedRepo);
		repo.ur = unifiedRepo;
	});

	this.emit('basic_repos', unifiedRepos);
	this.emit('fetching_readmes', toGo);

	repos.forEach(function(repo) {
		this._getReadme(username, repo.slug, function(err, readme) {
			repo.ur.readme = readme;
			toGo--;

			this.emit('repo_complete', repo.ur);

			if (toGo === 0) {
				callback(repos.map(function(repo) { return repo.ur; }));
			}
		}.bind(this));
	}.bind(this));
}

BitBucketRepoFetcher.prototype._getReadme = function(user, repoSlug, callback) {
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

			var readmePath = getReadmePath(data.files);
			if (readmePath) {
				this._getReadmeContent(user, repoSlug, readmePath, function(err, content) {
					if (err) {
						return callback(err);
					}

					return callback(null, {name: readmePath, content: content});
				});
			} else {
				callback(null, {name: '', content: ''});
			}
		}.bind(this));
	}.bind(this));

	function getReadmePath(files) {
		for (var i = 0; i < files.length; ++i) {
			if (files[i].path.match(/^readme\b/i)) {
				return files[i].path;
			}
		}
	}
}


BitBucketRepoFetcher.prototype._getReadmeContent = function(user, repoSlug, readmePath, callback) {
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

