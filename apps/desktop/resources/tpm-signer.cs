// Local CNG helper: no private-key export or software fallback.
using System;
using System.Security.Cryptography;
public static class FaramaceTpm {
  static CngProvider Provider = new CngProvider("Microsoft Platform Crypto Provider");
  const string Name = "Faramace.Device.Signing.v1";
  public static bool Exists() { return CngKey.Exists(Name, Provider); }
  public static void Create() {
    if (Exists()) return;
    var p = new CngKeyCreationParameters();
    p.Provider = Provider;
    p.KeyUsage = CngKeyUsages.Signing;
    p.ExportPolicy = CngExportPolicies.None;
    p.Parameters.Add(new CngProperty("Length", BitConverter.GetBytes(2048), CngPropertyOptions.None));
    using (var key = CngKey.Create(CngAlgorithm.Rsa, Name, p)) {}
  }
  public static string[] PublicKey() {
    using(var key = CngKey.Open(Name, Provider)) using(var rsa = new RSACng(key)) {
      var p = rsa.ExportParameters(false);
      return new [] { Convert.ToBase64String(p.Modulus), Convert.ToBase64String(p.Exponent) };
    }
  }
  public static string Sign(string digest) {
    using(var key = CngKey.Open(Name, Provider)) using(var rsa = new RSACng(key)) {
      return Convert.ToBase64String(rsa.SignHash(Convert.FromBase64String(digest), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
    }
  }
  public static bool PrivateExportBlocked() {
    using(var key = CngKey.Open(Name, Provider)) {
      try { key.Export(CngKeyBlobFormat.GenericPrivateBlob); return false; }
      catch (CryptographicException) { return true; }
    }
  }
}
public static class Program {
  public static void Main() {
    var json = new System.Web.Script.Serialization.JavaScriptSerializer();
    string line;
    while ((line = Console.ReadLine()) != null) {
      object id = null;
      try {
        var request = json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(line);
        id = request["id"];
        object result;
        switch ((string)request["action"]) {
          case "status": result = FaramaceTpm.Exists(); break;
          case "create": FaramaceTpm.Create(); result = FaramaceTpm.PublicKey(); break;
          case "public": result = FaramaceTpm.PublicKey(); break;
          case "sign": result = FaramaceTpm.Sign((string)request["digest"]); break;
          case "export-check": result = FaramaceTpm.PrivateExportBlocked(); break;
          case "metrics": result = System.Diagnostics.Process.GetCurrentProcess().WorkingSet64; break;
          default: throw new Exception("Unsupported command");
        }
        Console.WriteLine(json.Serialize(new {id=id,ok=true,result=result}));
      } catch {
        Console.WriteLine(json.Serialize(new {id=id,ok=false,error="TPM key unavailable; check Windows TPM readiness or re-enrol this device."}));
      }
    }
  }
}
