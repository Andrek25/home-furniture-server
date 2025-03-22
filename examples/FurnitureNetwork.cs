using System;
using System.Collections;
using System.Net;
using UnityEngine;
using UnityEngine.Networking;

namespace FurnitureNetwork
{
  public class Network
  {
    public string apiUri;

    [HideInInspector] public string token;

    private IEnumerator GetAllFurnitures(Action<GetFurnituresMessage> callback = null, Action<string> errorCallback = null)
    {
      using UnityWebRequest webRequest = UnityWebRequest.Get($"{apiUri}/api/v1/furnitures");
      webRequest.SetRequestHeader("x-playfab-auth-token", token);

      yield return webRequest.SendWebRequest();

      if (webRequest.result == UnityWebRequest.Result.Success)
      {
        var result = JsonUtility.FromJson<GetFurnituresMessage>(webRequest.downloadHandler.text);
        callback?.Invoke(result);
      }
      else
      {
        errorCallback?.Invoke(webRequest.error);
      }
    }

    private IEnumerator DownloadFurniture(int id, Action<byte[]> callback = null, Action<string> errorCallback = null)
    {
      using UnityWebRequest webRequest = UnityWebRequest.Get($"{apiUri}/api/v1/furniture/{id}");
      webRequest.SetRequestHeader("x-playfab-auth-token", token);

      yield return webRequest.SendWebRequest();

      if (webRequest.result == UnityWebRequest.Result.Success)
      {
        byte[] result = webRequest.downloadHandler.data;
        callback?.Invoke(result);
      }
      else
      {
        errorCallback?.Invoke(webRequest.error);
      }
    }

    public UnityWebRequest GenerateDownloadRequest(string id)
    {
      UnityWebRequest webRequest = UnityWebRequest.Get($"{apiUri}/api/v1/furniture/{id}");
      webRequest.SetRequestHeader("x-playfab-auth-token", token);
      return webRequest;
    }

    public IEnumerator UploadFurniture(string filePath, string thumbnailPath = null, Action<UploadFurnitureMessage> callback = null, Action<string> errorCallback = null)
    {
      byte[] fileData = System.IO.File.ReadAllBytes(filePath);
      string fileName = System.IO.Path.GetFileName(filePath);
      string fileExtension = System.IO.Path.GetExtension(filePath).TrimStart('.');

      var form = new WWWForm();
      form.AddBinaryData("file", fileData, fileName, $"application/{fileExtension}");
      if (thumbnailPath != null)
      {
        byte[] thumbnailData = System.IO.File.ReadAllBytes(thumbnailPath);
        string thumbnailName = System.IO.Path.GetFileName(thumbnailPath);
        string thumbnailExtension = System.IO.Path.GetExtension(thumbnailPath).TrimStart('.');
        form.AddBinaryData("thumbnail", thumbnailData, thumbnailName, $"image/{thumbnailExtension}");
      }

      using UnityWebRequest webRequest = UnityWebRequest.Post($"{apiUri}/api/v1/furniture", form);
      webRequest.SetRequestHeader("x-playfab-auth-token", token);

      yield return webRequest.SendWebRequest();

      if (webRequest.result == UnityWebRequest.Result.Success)
      {
        UploadFurnitureMessage result = JsonUtility.FromJson<UploadFurnitureMessage>(webRequest.downloadHandler.text);
        callback?.Invoke(result);
      }
      else
      {
        errorCallback?.Invoke(webRequest.error);
      }
    }


    public IEnumerator UploadFurniture(byte[] fileData, string fileName, string fileExtension, string thumbnailPath = null, Action<UploadFurnitureMessage> callback = null, Action<string> errorCallback = null)
    {
      //byte[] fileData = System.IO.File.ReadAllBytes(filePath);
      //string fileName = System.IO.Path.GetFileName(filePath);
      //string fileExtension = System.IO.Path.GetExtension(filePath).TrimStart('.');

      var form = new WWWForm();
      form.AddBinaryData("file", fileData, fileName, $"application/{fileExtension}");
      if (thumbnailPath != null)
      {
        byte[] thumbnailData = System.IO.File.ReadAllBytes(thumbnailPath);
        string thumbnailName = System.IO.Path.GetFileName(thumbnailPath);
        string thumbnailExtension = System.IO.Path.GetExtension(thumbnailPath).TrimStart('.');
        form.AddBinaryData("thumbnail", thumbnailData, thumbnailName, $"image/{thumbnailExtension}");
      }

      using UnityWebRequest webRequest = UnityWebRequest.Post($"{apiUri}/api/v1/furniture", form);
      webRequest.SetRequestHeader("x-playfab-auth-token", token);

      yield return webRequest.SendWebRequest();

      if (webRequest.result == UnityWebRequest.Result.Success)
      {
        UploadFurnitureMessage result = JsonUtility.FromJson<UploadFurnitureMessage>(webRequest.downloadHandler.text);
        callback?.Invoke(result);
      }
      else
      {
        errorCallback?.Invoke(webRequest.error);
      }
    }
    private IEnumerator DeleteFurniture(string id, Action callback = null, Action<string> errorCallback = null)
    {
      using UnityWebRequest webRequest = UnityWebRequest.Delete($"{apiUri}/api/v1/furniture/{id}");
      webRequest.SetRequestHeader("x-playfab-auth-token", token);
      yield return webRequest.SendWebRequest();
      if (webRequest.result == UnityWebRequest.Result.Success)
      {
        callback?.Invoke();
      }
      else
      {
        errorCallback?.Invoke(webRequest.error);
      }
    }

    private IEnumerator UpdateFurnitureFile(int id, string filePath, Action callback = null, Action<string> errorCallback = null)
    {
      byte[] fileData = System.IO.File.ReadAllBytes(filePath);
      string fileName = System.IO.Path.GetFileName(filePath);
      string fileExtension = System.IO.Path.GetExtension(filePath);

      var form = new WWWForm();
      form.AddBinaryData("file", fileData, fileName, $"application/{fileExtension}");

      using UnityWebRequest webRequest = UnityWebRequest.Post($"{apiUri}/api/v1/furniture/{id}/file", form);
      webRequest.SetRequestHeader("x-playfab-auth-token", token);

      yield return webRequest.SendWebRequest();

      if (webRequest.result == UnityWebRequest.Result.Success)
      {
        callback?.Invoke();
      }
      else
      {
        errorCallback?.Invoke(webRequest.error);
      }
    }

    private IEnumerator UpdateFurnitureThumbnail(int id, string filePath, Action callback = null, Action<string> errorCallback = null)
    {
      byte[] thumbnailData = System.IO.File.ReadAllBytes(filePath);
      string thumbnailName = System.IO.Path.GetFileName(filePath);
      string thumbnailExtension = System.IO.Path.GetExtension(filePath).TrimStart('.');

      var form = new WWWForm();
      form.AddBinaryData("thumbnail", thumbnailData, thumbnailName, $"image/{thumbnailExtension}");

      using UnityWebRequest webRequest = UnityWebRequest.Post($"{apiUri}/api/v1/furniture/{id}/thumbnail", form);
      webRequest.SetRequestHeader("x-playfab-auth-token", token);

      yield return webRequest.SendWebRequest();

      if (webRequest.result == UnityWebRequest.Result.Success)
      {
        callback?.Invoke();
      }
      else
      {
        errorCallback?.Invoke(webRequest.error);
      }
    }
  }

  [Serializable]
  public class UpdateFurnitureFileRequestBody
  {
    public byte[] file;
  }

  [Serializable]
  public class GetFurnitureMessageFurniture
  {
    public int id;
    public string file_name;
    public string thumbnail;
  }

  [Serializable]
  public class GetFurnituresMessage
  {
    public GetFurnitureMessageFurniture[] furnitures;
  }

  [Serializable]
  public class UploadFurnitureMessage
  {
    [SerializeField] public string id;
  }
}