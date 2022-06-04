// let socket = new ReconnectingWebSocket("ws://127.0.0.1:24050/ws");
let socket = io();

// ----------------------- Variables

//Animated Containers
let infoContainer = document.getElementById("info-container");
let trackContainer = document.getElementById("track-container");
let bgWrapper = document.getElementById("bg-wrapper");
let ppContainer = document.getElementById("pp-container");

// Map Info
let title = document.getElementById("title");
let artist = document.getElementById("artist");
let bg = document.getElementById("bg");

// Hits & PP
let hun = document.getElementById("h100");
let fifty = document.getElementById("h50");
let miss = document.getElementById("h0");
let pp = document.getElementById("pp");

// Rank
let rank = document.getElementById("rank");

// Root
let root = document.documentElement;

// Websocket
socket.on("connect", () => {
  var params = new Proxy(new URLSearchParams(window.location.search), { get: (searchParams, prop) => searchParams.get(prop), });
  socket.emit("authWeb", params.s);
});

// Temp Variables
let tempImg;
let tempTitle;
let tempArtist;
let gameState;
let hdfl;

function reflow(elt) {
  console.log(elt.offsetHeight);
}

function generateRank(data) {
  var total = data.hits[300] + data.hits[100] + data.hits[50] + data.hits["miss"];
  var r300 = data.hits[300] / total;
  var r50 = data.hits[50] / total;

  if (r300 === 1) return "SS";
  else if (r300 > 0.9 && r50 < 0.01 && data.hits["miss"] === 0) return "S";
  else if ((r300 > 0.8 && data.hits["miss"] === 0) || r300 > 0.9) return "A";
  else if ((r300 > 0.7 && data.hits["miss"] === 0) || r300 > 0.8) return "B";
  else if (r300 > 0.6) return "C";
  else return "D";
}

socket.on("data", (data) => {
  if(data.mods.includes("HD") || data.mods.includes("FL")) hdfl = true;
  else hdfl = false;

  dataArtist = data.name.match(/\w+.\w+/)[0];
  dataTitle = data.name.match(/^(?:.*?)\s-\s(.*?)\s(?:\[.*?\])/)[1];
  dataVersion = data.name.match(/(?!.*\[)(?<=\[).+?(?=\])/)[0];

  // Title & Artist Check
  if (tempTitle !== dataTitle) {
    tempTitle = dataTitle;
    title.innerHTML = tempTitle;
  }
  if (tempArtist !== dataArtist) {
    tempArtist = dataArtist;
    artist.innerHTML = tempArtist;
  }

  // Text Scroll Animation
  var widthLimit = 700 * 0.9;
  var titleWidth = title.offsetWidth;
  var artistWidth = artist.offsetWidth;
  if (getComputedStyle(root).getPropertyValue("--text-scroll") == 1) {
    title.style.cssText = "position: relative; left: 0;";
    if (titleWidth > widthLimit) {
      var timeTaken = titleWidth / getComputedStyle(root).getPropertyValue("--text-scroll-speed");
      title.style.animationDuration = timeTaken + "s";
      title.className = "textScroll";
    } else {
      title.className = "";
    }
    if (artistWidth > widthLimit - 100) {
      var timeTaken = artistWidth / getComputedStyle(root).getPropertyValue("--text-scroll-speed");
      artist.style.animationDuration = timeTaken + "s";
      artist.className = "textScroll";
    } else {
      artist.className = '"";';
    }
  } else {
    if (titleWidth > 600) {
      title.style.cssText = "position: relative; left: 90px;";
    } else {
      title.style.cssText = "position: relative; left: 0px;";
    }
    if (artistWidth > 600) {
      artist.style.cssText = "position: relative; left: 90px;";
    } else {
      artist.style.cssText = "position: relative; left: 0px;";
    }
    artist.className = "";
    title.className = "";
  }

  // PP & Hits Animation
  if (Math.round(data.pp) != pp.innerHTML) {
    let ppData = data.pp;
    pp.innerHTML = Math.round(ppData);
    ppContainer.classList.remove("click");
    reflow(ppContainer);
    ppContainer.classList.add("click");
  }
  if (data.hits[100] != h100.innerHTML) {
    hun.innerHTML = data.hits[100];
    hun.classList.remove("click");
    reflow(hun);
    hun.classList.add("click");
  }
  if (data.hits[50] != h50.innerHTML) {
    fifty.innerHTML = data.hits[50];
    fifty.classList.remove("click");
    reflow(fifty);
    fifty.classList.add("click");
  }
  if (data.hits["miss"] != h0.innerHTML) {
    miss.innerHTML = data.hits["miss"];
    miss.classList.remove("click");
    reflow(miss);
    miss.classList.add("click");
  }

  if (generateRank(data) == "SS") {
    if (hdfl == true) {
      rank.style.color = "#D3D3D3";
      rank.style.textShadow = "0 0 0.5rem #D3D3D3";
    } else {
      rank.style.color = "#d6c253";
      rank.style.textShadow = "0 0 0.5rem #d6c253";
    }
  } else if (generateRank(data) == "S") {
    if (hdfl == true) {
      rank.style.color = "#D3D3D3";
      rank.style.textShadow = "0 0 0.5rem #D3D3D3";
    } else {
      rank.style.color = "#d6c253";
      rank.style.textShadow = "0 0 0.5rem #d6c253";
    }
  } else if (generateRank(data) == "A") {
    rank.style.color = "#7ed653";
    rank.style.textShadow = "0 0 0.5rem #7ed653";
  } else if (generateRank(data) == "B") {
    rank.style.color = "#53d4d6";
    rank.style.textShadow = "0 0 0.5rem #53d4d6";
  } else if (generateRank(data) == "C") {
    rank.style.color = "#d6538e";
    rank.style.textShadow = "0 0 0.5rem #d6538e";
  } else {
    rank.style.color = "#d6c253";
    rank.style.textShadow = "0 0 0.5rem #d6c253";
  }

  if (generateRank(data) != rank.innerHTML) {
    rank.innerHTML = generateRank(data);
    rank.classList.remove("click");
    reflow(rank);
    rank.classList.add("click");
  }

  // Background Image Check
  if (tempImg !== data.img) {
    tempImg = data.img;
    bg.setAttribute("src", `${data.img}`);
  }

  // Game State Check
  if (gameState !== data.playing) {
    gameState = data.playing;
    //Playing State
    if (gameState === true) {
      bg.style.cssText = "width: 500px; height: 500px; border-radius: 50%; position: absolute; top: -100px; left: -200px;";
      trackContainer.style.transform = "translateY(-45px) scale(0.85)";
      infoContainer.style.cssText = "transform: translateY(0); opacity: 1; bottom: 30px;";
    } else {
      //Menu State
      bg.style.cssText = "width: 100%; height: 100%; border-radius: 0; position: absolute; top: 0; left: 0;";
      trackContainer.style.transform = "translateY(0) scale(1)";
      infoContainer.style.cssText = "transform: translateY(500px); opacity: 0; bottom: -500px;";
    }
  }

});