const ENV = process.env.ADS_ENV || "prod";

module.exports = {
  outputFile:
    ENV === "test"
      ? "app-ads.test.txt"
      : "app-ads.txt",

  networks: {
    Admob: "ads/admob.txt",
    Meta: "ads/meta.txt",
    Applovin: "ads/applovin.txt",
    Mintegral: "ads/mintegral.txt",
    Liftoff: "ads/liftoff.txt",
    Unity: "ads/unity.txt",
    Pangle: "ads/pangle.txt",
    "Inmobi Admob": "ads/inmobi_admob.txt",
    "Inmobi MAX": "ads/inmobi_max.txt"
  }
};
