var GitHubApi = require("github").GitHubApi;
var EventEmitter = require('events').EventEmitter;
var util = require('util');

function GitHubRepoFetcher() {
	EventEmitter.call(this);
}
util.inherits(GitHubRepoFetcher, EventEmitter);

exports.GitHubRepoFetcher = GitHubRepoFetcher;

GitHubRepoFetcher.prototype.userRepos = function(username) {
	var github = new GitHubApi();
	github.getRepoApi().getUserRepos(username, function(err, ghRepos) {
		this._unifiedRepoInfo(username, ghRepos, function(repos) {
			this.emit('end', repos);
		}.bind(this));
	}.bind(this));
}

GitHubRepoFetcher.prototype._unifiedRepoInfo = function(username, repos, callback) {
	var unifiedRepos = [];
	var toGo = repos.length;

	repos.forEach(function(repo) {
		var unifiedRepo = {};
		unifiedRepo.name = repo.name;
		unifiedRepo.description = repo.description;
		unifiedRepos.push(unifiedRepo);
	});

	this.emit('basic_repos', unifiedRepos);
	this.emit('fetching_readmes', toGo);

	unifiedRepos.forEach(function(repo) {
		this._getReadme(username, repo.name, function(readme) {
			repo.readme = readme;
			toGo--;
			this.emit('repo_complete', repo);

			if (toGo === 0) {
				callback(unifiedRepos);
			}
		}.bind(this));
	}.bind(this));
}

GitHubRepoFetcher.prototype._getReadme = function(username, repo, callback) {
	var github = new GitHubApi();
	github.getObjectApi().listBlobs(username, repo, 'master', function(err, files) {
		if (err) {
			console.log('err: ' + err);
			return callback({name: '', content: ''});
		}

		var readmeMetadata = getReadmeMetadata(files);
		if (readmeMetadata) {
			var github = new GitHubApi();
			github.getObjectApi().getRawData(username, repo, readmeMetadata.sha1, function(err, content) {
				callback({name: readmeMetadata.name, content: content});
			});
		} else {
			callback({name: '', content: ''});
		}
	});

	function getReadmeMetadata(files) {
		for (filename in files) {
			if (filename.match(/^readme\b/i)) {
				var readmeSha1 = files[filename];
				return {name: filename, sha1: readmeSha1};
			}
		}
	}
}

