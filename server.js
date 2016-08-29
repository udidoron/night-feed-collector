
'use strict';

const fs = require("fs"); //for mkdirSync, appendFileSync, statSync
const request = require("request"); //for request.head, request() and for generally getting sites/downloading files
const cheerio = require("cheerio"); //for parsing a page with a picture

// creating Twitter client
const Twitter = require("twitter");
const client = new Twitter({
	consumer_key: process.env.twit_client_consumer_key,
	consumer_secret: process.env.twit_client_consumer_secret,
	access_token_key: process.env.twit_client_access_token,
	access_token_secret: process.env.twit_client_access_token_secret
});

const INTERVAL_LENGTH = 60000; //1 request every 1 minute -> 15 request per 15 minutes = twitter rate limit

const TWEET_FILE_NAME = "tweets-"+new Date().toDateString()+".txt";
const FULL_TWEET_DATA_FILE_NAME = "full-tweets-"+new Date().toDateString()+".txt";
const PROFILE_IMAGES_DIR_PATH = "./profile_images";
const TWEET_IMAGES_DIR_PATH = "./tweet_images";
const TWEET_HTML_FILE_NAME = "tweets-"+new Date().toDateString()+"-open_in_chrome.html";

var tweets_arr = [];

// creating profile_images and tweet_images directories, if they don't already exist
try {
	fs.mkdirSync(PROFILE_IMAGES_DIR_PATH);
} catch (err) {
	// do nothing
}
try {
	fs.mkdirSync(TWEET_IMAGES_DIR_PATH);
} catch (err) {
	// do nothing
}

function download(uri, filename, callback){
  request.head(uri, function(err, res, body){
    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
};


function generate_tweet_html(tweet) {
	const has_pictures = tweet["pictures"].length > 0;
	let pictures_html_strs = [];
	if (has_pictures) {
		pictures_html_strs = tweet["pictures"].map(picture => {
			return `<img src="${picture}" onclick="togglePic(${picture})" />
					<br />`;
		});
	}
	const is_response = tweet["in_reply_to_status_id"] != null;
	let retstr = `<div class="tweet" data-tweet-id="`+tweet["id"]+`">`
	retstr += `<div class="left-side">
					<img class="profile_pic" src="`+tweet["user"]["profile_image_path"]+`" />
					<b> `+tweet["user"]["name"]+`</b>
					<span class="screen_name"> `+tweet["user"]["screen_name"] +`</span>
				</div>

				<div class="center">
				`+tweet["text"]+` <br />`;
	if(has_pictures) {
		retstr += pictures_html_strs;
	}
	retstr += `	</div>
				<div class="right-side"> `
	if(is_response) {
		// retstr += `<span> In response to <a href="#`+tweet["in_reply_to_status_id"]+`" onclick="jump('#`+tweet["in_reply_to_status_id"]+`')"> tweet by `+tweet["user"]["name"]+` </a> </span> `;
		retstr += `<span> In response to <a onclick="jump('#`+tweet["in_reply_to_status_id"]+`')"> tweet by `+tweet["user"]["name"]+` </a> </span> `;

	}
	retstr += `<a href="https://twitter.com/`+tweet["user"]["screen_name"]+`/status/`+tweet["id"]+`"> (see original) </a> `;
	retstr += `</div>
			</div>`;
	return retstr;
}


function generate_page_html(trimmed_tweets_array) {
	var pageHTML = `
		<link rel="stylesheet" href="style.css" />

		<script>

		function jump(h){
		    var top = document.querySelector("div[data-tweet-id='"+h+"']").offsetTop; //Getting Y of target element
		    window.scrollTo(0, top);                        //Go there directly or some transition
		}

		var pic_toggles = {};

		function togglePic(pic) {
		    if (!pic_toggles[pic]) { 
		        pic_toggles[pic] = true; 
		        document.querySelector("img[src='"+pic+"']").style.width = "800px"; 
		        document.querySelector("img[src='"+pic+"']").style.height = "800px"; 
		    }
		    else if (pic_toggles[pic]) {
		        document.querySelector("img[src='"+pic+"']").style.width = "30%"; 
		        document.querySelector("img[src='"+pic+"']").style.height = "70%"; 
		        pic_toggles[pic] = false;
		    }
		}
		</script> `;

	trimmed_tweets_array.forEach(function(tweet) {
		pageHTML += generate_tweet_html(tweet);
	});

	return pageHTML;

}


function get_tweet_link(tweet_text) {
	const t_co_regex = new RegExp("http[s]?:\\/\\/t\.co\\/[A-z0-9]{10}"); //example URI: https://t.co/eyW4jT47JW
	return t_co_regex.exec(tweet_text); //returns [first match] if found, null if not
}


// listening to tweets
var streaming_interval = setInterval(function grabLatestTimeline() {

	// getting latest tweets
	client.get("statuses/home_timeline", {
		count: 15

	}, function(error, tweets, response) {
		if (error) {
			console.log("Error: ", error);
			//TODO exit gracefully, saving all tweets up to this point
			throw error;
		}
		// console.log("===========Tweets at %s: ==============", new Date().toUTCString()); //TODO remove
		fs.appendFileSync(TWEET_FILE_NAME, "===========Tweets at "+new Date().toUTCString()+": ==============\n"); 
		// console.log(tweets); //TODO remove
		// adding tweets to tweets_arr if they don't already exist there
		tweets.forEach(curr_tweet => {			
			const preexisting = tweets_arr.filter((tweet) => tweet["id_str"] == curr_tweet["id_str"]);
			if (preexisting.length === 0) { //doesn't already exist
				// adding trimmed tweet object to tweets_arr
				const trimmed_tweet_object = {
					id: curr_tweet["id_str"],
					id_str: curr_tweet["id_str"],
					text: curr_tweet["text"],
					in_reply_to_status_id: curr_tweet["in_reply_to_status_id_str"],
					in_reply_to_status_id_str: curr_tweet["in_reply_to_status_id_str"],
					in_reply_to_screen_name: curr_tweet["in_reply_to_screen_name"],
					user: {
						id: curr_tweet["user"]["id"],
						name: curr_tweet["user"]["name"],
						screen_name: curr_tweet["user"]["screen_name"],
						profile_image_url: curr_tweet["user"]["profile_image_url"]
					}
				};

				// downloading profile image if necessary
				const user_profile_image_path = PROFILE_IMAGES_DIR_PATH+"/profile_image_user_"+curr_tweet["user"]["screen_name"]+".jpg";
				try {
					fs.statSync(user_profile_image_path);
				} catch(err) { //no profile image like that
					download(curr_tweet["user"]["profile_image_url"], user_profile_image_path, () => {
						console.log("Downloaded profile picture for user %s", curr_tweet["user"]["screen_name"]); //TODO log on debug
					});
				}
				trimmed_tweet_object["user"]["profile_image_path"] = user_profile_image_path;

				// downloading pictures from tweet if existing
				trimmed_tweet_object["pictures"] = [];
				let tweet_link = get_tweet_link(curr_tweet["text"]);
				// console.log("curr_tweet[media]: "+curr_tweet["media"]);
				// if (curr_tweet["media"] && curr_tweet["media"].length > 0) {
				if(tweet_link != null) {
					let added_pictures = [];
					// let tweet_link = get_tweet_link(curr_tweet["text"]);
					let tweet_link = "https://twitter.com/"+curr_tweet["user"]["screen_name"]+"/status/"+curr_tweet["id"];
					console.log("accessing link "+tweet_link);
					if (tweet_link != null) { // TODO remove if we access the actual tweet
						// tweet_link = tweet_link[0]; //exec() returns a length-1 array
						// getting the picture
						request(tweet_link, (error, response, body) => {
							if (error) {
								console.error("Error when requesting %s (looking for tweet picture): %s", tweet_link, error);
								throw error;
							}
							if (response.statusCode == 200) {
								console.log("attempting to download pictures..");
								const $ = cheerio.load(body);
								// getting an array of all inner-tweet pictures
								const picture_url_array = Array.from($(".tweet[data-associated-tweet-id='"+curr_tweet["id"]+"'] [data-image-url]"));
								console.log("Found %d pictures in tweet (matching the criteria).", picture_url_array.length);
								let picture_counter = 0;
								// going over all inner-tweet pictures, drawing their data-image-url-s and downloading those URLs
								for (var ind=0; ind<picture_url_array.length; ind++) {
									const curr_picture_url = picture_url_array[ind].getAttribute("data-image-url");
									let tweet_picture_file_path = TWEET_IMAGES_DIR_PATH+"/tweet_"+curr_tweet["id"]+"image_"+(picture_counter++)+".jpg";
									download(curr_picture_url, tweet_picture_file_path, function() {
										console.log("Downloaded picture "+picture_counter+" from tweet "+curr_tweet["id"]);
										added_pictures.push(tweet_picture_file_path);
									});
								}
								
							}
						})
					}
					trimmed_tweet_object["pictures"] = added_pictures;	
				}

				// adding trimmed tweet object to tweets array
				tweets_arr.push(trimmed_tweet_object);
				fs.appendFileSync(TWEET_FILE_NAME, JSON.stringify(trimmed_tweet_object)+"\n");
				fs.appendFileSync(FULL_TWEET_DATA_FILE_NAME, "=========================================================================================\n");
				fs.appendFileSync(FULL_TWEET_DATA_FILE_NAME, JSON.stringify(curr_tweet)+"\n");
				fs.appendFileSync(FULL_TWEET_DATA_FILE_NAME, "=========================================================================================\n");

				// TODO: 
				// - add trimmed_tweet_object to tweets_arr = DONE
				// - download profile image if necessary - i.e. check profile images directory if profile_image_(screen_name) exists for the user and if not, download it - DONE
				// - download any pictures from tweet if existing - i.e. check if tweet's entities.media.length > 0 then parse tweet for link if so, and download similar to cheerio test - DONE
				// - on ctrl+c create HTML page of tweets from tweets_arr (including anchors per each tweet ID and a link to previous anchors in replying tweets) and save said page
				// - install a decent logger and/or log the process - after basic version works
				// - work on date-specific generated directories for tweets and images, and central profile picture directory - after basic version works
			}
		})
		fs.appendFileSync(TWEET_FILE_NAME, tweets); //TODO replace by code in forEach
		console.log("============Done with tweets at %s===============", new Date().toUTCString()); //TODO replace with "Logged %d new tweets to %s", new_tweets, TWEET_FILE_NAME.
	});

}, INTERVAL_LENGTH); 


// SIGINT listener
if (process.platform === "win32") {
  var rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", function () {
    process.emit("SIGINT");
  });
}

process.on("SIGINT", function () {
  //graceful shutdown
  console.log("Writing collected tweets to HTML file "+TWEET_HTML_FILE_NAME+"...");
  var tweet_page_html = generate_page_html(tweets_arr);
  fs.writeFileSync(TWEET_HTML_FILE_NAME, tweet_page_html, {"encoding": "utf8"}); //writeFile - because it's intended to run only once
  console.log("Done writing to file.");
  process.exit();
});



console.log("Running, expect first tweets to come in within a minute..");