
/**
 * Module dependencies.
 */

var express = require('express');
var Resource = require('express-resource');
var urlparser = require('url');

var app = module.exports = express.createServer();

// Configuration

app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
	app.set('view options', { pretty: true })
	app.use(express.favicon('favicon.ico'));
	app.use(express.cookieParser());
	app.use(express.session({secret: 'foobar'}));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
	app.use(authCheck);
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

app.configure('development', function() {
	app.use(express.logger());
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function() {
    app.use(express.errorHandler()); 
});

// Middleware

function authCheck(req, res, next) {
    url = req.urlp = urlparser.parse(req.url, true);

    if (req.session && req.session.auth == true) {
        return next(); // stop here and pass to the next onion ring of connect
    }

	checkCookieForAuth(function(cookie_is_valid, user) {
		if (cookie_is_valid) {
			req.session.auth = true;
			req.session.user = user;
		}

		return next();
	});


	function checkCookieForAuth(callback) {
		var sid = req.cookies.session_id;

		var redis = require('redis');
		var r = redis.createClient();
		r.get('sessions:' + sid, function(err, username) {
			if (err) {
				return callback(false);
			}

			r.hget('sessions', username, function(err, db_sid) {
				if (err) {
					return callback(false);
				}

				var retval = typeof db_sid != undefined && db_sid != null && ''+db_sid === ''+sid;
				return callback(retval, username);
			});
		});
	}
}

app.dynamicHelpers({
	auth_user: function(req, res) {
		if (req.session && req.session.user) {
			return req.session.user;
		} else {
			return null;
		}
	},
	active_page: function(req, res) {
		var url = urlparser.parse(req.url, true);
		if (url.pathname.substring(1, 'users'.length + 1) == 'users') {
			console.log('setting active_page to users');
	        return 'users';
        }

		if (url.pathname.substring(1, 'repos'.length + 1) == 'repos') {
			console.log('setting active_page to repositories');
	        return 'repositories';
        }

		if (url.pathname.substring(1, 'bbrepos'.length + 1) == 'bbrepos') {
			console.log('setting active_page to repositories');
	        return 'repositories';
        }

		if (url.pathname.substring(1, 'ghrepos'.length + 1) == 'ghrepos') {
			console.log('setting active_page to repositories');
	        return 'repositories';
        }

		if (url.pathname == '/') {
	        return 'home';
        }
	}
})


// Routes

app.resource('users', require('./resources/users.js'));
app.resource('repos', require('./resources/repos.js'));
app.resource('ghrepos', require('./resources/ghrepos.js'));
app.resource('bbrepos', require('./resources/bbrepos.js'));

app.get('/', function(req, res) {
    res.render('index', {
        title: 'Garden',
    });
});

app.get('/login', function(req, res) {
	require('google-openid').create(app, 'http://' + req.headers.host, onGoogleAuthentication);
	res.render('login_user', {
		title: 'Enter Garden',
	});
});

var onGoogleAuthentication = function(error, req, res, openid_result) {
	if (error) {
		res.writeHead(403);
		res.end(error);
	} else if (!openid_result || !openid_result.authenticated) {
		res.writeHead(403);
		res.end('Not authenticated');
	} else if (!openid_result.email) {
		res.writeHead(403);
		res.end('Could not get your email address from google');
	} else {
		// User is authenticated with google

		console.log('we\'re in');

		var redis = require('redis');
		var r = redis.createClient();
		r.get('emailusermap:' + openid_result.email, function(err, user) {
			if (err || !user) {
				// User has not logged in before
				return res.redirect('/users/new?google=google&email=' + openid_result.email);
			}

			var session_id = Math.random() * 100000000;
			r.hset('sessions', user, session_id, function(e, r) {});
			r.set('sessions:' + session_id, user, function(e, r) {});
			res.cookie('session_id', session_id, {maxAge: 5*60*1000, path: '/'});
			res.redirect('/');
		});
	}
};

app.post('/sessions', function(req, res) {
	var attempted_password = req.body.password;
	var username = req.body.user_name;
	var redis = require('redis');
	var r = redis.createClient();

	r.hget('users', username, function(err, user) {
		if (err || !user) {
			return res.redirect('/', 403);
		}

		user = JSON.parse(user);

		if ((user.salt + '_' + attempted_password) === user.password_hash) {
			// Correct username + password
			var session_id = Math.random() * 100000000;
			r.hset('sessions', username, session_id, function(e, r) {});
			r.set('sessions:' + session_id, username, function(e, r) {});
			res.cookie('session_id', session_id, {maxAge: 5*60*1000});
			res.redirect('/');
		} else {
			res.writeHead(403);
			res.end('Wrong username or password');
		}
	});
});



app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
