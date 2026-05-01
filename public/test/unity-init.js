var canvas = document.querySelector("#unity-canvas");
var buildUrl = "/test/Build";

var config = {
    dataUrl: buildUrl + "/clean.data",
    frameworkUrl: buildUrl + "/clean.framework.js",
    codeUrl: buildUrl + "/clean.wasm",
    streamingAssetsUrl: "/test/StreamingAssets",
    companyName: "DefaultCompany",
    productName: "My project",
    productVersion: "1.0",
};

document.querySelector("#unity-loading-bar").style.display = "block";

var script = document.createElement("script");
script.src = buildUrl + "/clean.loader.js";
script.onload = () => {
    createUnityInstance(canvas, config, (progress) => {
        document.querySelector("#unity-progress-bar-full").style.width = (100 * progress) + "%";
    }).then((unityInstance) => {
        document.querySelector("#unity-loading-bar").style.display = "none";
    }).catch((message) => {
        alert(message);
    });
};
document.body.appendChild(script);
