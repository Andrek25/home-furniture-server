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

        // P5 self-heal: HEAD /api/v1/furniture/{id} so callers can distinguish a
        // missing row (404 → safe to delete the corresponding PlayFab room key)
        // from a transient network/auth failure (do not delete).
        public IEnumerator CheckFurnitureExists(string id, Action onFound = null, Action onMissing = null, Action<string> onError = null)
        {
            using UnityWebRequest webRequest = UnityWebRequest.Head($"{apiUri}/api/v1/furniture/{id}");
            webRequest.SetRequestHeader("x-playfab-auth-token", token);

            yield return webRequest.SendWebRequest();

            if (webRequest.result == UnityWebRequest.Result.Success)
            {
                onFound?.Invoke();
            }
            else if (webRequest.responseCode == (long)HttpStatusCode.NotFound)
            {
                onMissing?.Invoke();
            }
            else
            {
                onError?.Invoke($"{webRequest.responseCode} {webRequest.error}");
            }
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
        public IEnumerator DeleteFurniture(string id, Action callback = null, Action<string> errorCallback = null)
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

        public IEnumerator UpdateFurnitureFile(int id, string filePath, Action callback = null, Action<string> errorCallback = null)
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


public IEnumerator DuplicateFurniture(string id, Action<DuplicateTokenMessage> callback = null, Action<string> errorCallback = null)
        {
            using UnityWebRequest webRequest = UnityWebRequest.Get($"{apiUri}/api/v1/duplicate-furniture/{id}");
            webRequest.SetRequestHeader("x-playfab-auth-token", token);

            yield return webRequest.SendWebRequest();

            if (webRequest.result == UnityWebRequest.Result.Success)
            {
                var result = JsonUtility.FromJson<DuplicateTokenMessage>(webRequest.downloadHandler.text);
                callback?.Invoke(result);
            }
            else
            {
                errorCallback?.Invoke(webRequest.error);
            }
        }

        public IEnumerator ClaimDuplicateFurniture(string furniture_token, string thumbnailPath = null, Action<UploadFurnitureMessage> callback = null, Action<string> errorCallback = null)
        {
            var form = new WWWForm();
            if (thumbnailPath != null)
            {
                byte[] thumbnailData = System.IO.File.ReadAllBytes(thumbnailPath);
                string thumbnailName = System.IO.Path.GetFileName(thumbnailPath);
                string thumbnailExtension = System.IO.Path.GetExtension(thumbnailPath).TrimStart('.');
                form.AddBinaryData("thumbnail", thumbnailData, thumbnailName, $"image/{thumbnailExtension}");
            }

            using UnityWebRequest webRequest = UnityWebRequest.Post($"{apiUri}/api/v1/duplicate-furniture/{furniture_token}", form);
            webRequest.SetRequestHeader("x-playfab-auth-token", this.token);

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



        public IEnumerator GetFurnitureThumbnail(string id, Action<byte[]> callback = null, Action<string> errorCallback = null)
        {
            using UnityWebRequest webRequest = UnityWebRequest.Get($"{apiUri}/api/v1/furniture/{id}/thumbnail");
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
        public IEnumerator UpdateFurnitureThumbnail(int id, string filePath, Action callback = null, Action<string> errorCallback = null)
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
        public IEnumerator UpdateFurnitureThumbnail(int id, Texture2D texture, Action callback = null, Action<string> errorCallback = null)
        {
            if (texture == null)
            {
                errorCallback?.Invoke("Texture is null.");
                yield break;
            }

            // Encode texture to PNG (or JPG if you prefer)
            byte[] thumbnailData;
            try
            {
                //thumbnailData = texture.EncodeToPNG();
                // For JPG instead:
                thumbnailData = texture.EncodeToPNG(); // quality 0�100
            }
            catch (System.Exception ex)
            {
                errorCallback?.Invoke($"Failed to encode texture: {ex.Message}");
                yield break;
            }

            string thumbnailName = "thumbnail.png";       // arbitrary filename
            string thumbnailMime = "image/png";           // match EncodeToPNG

            var form = new WWWForm();
            form.AddBinaryData("thumbnail", thumbnailData, thumbnailName, thumbnailMime);

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
        private IEnumerator GetFurnitureOwners(int id, Action<GetFurnitureOwnersMessage> callback = null, Action<string> errorCallback = null)
        {
            using UnityWebRequest webRequest = UnityWebRequest.Get($"{apiUri}/furniture/{id}/owners");
            webRequest.SetRequestHeader("x-playfab-auth-token", token);

            yield return webRequest.SendWebRequest();

            if (webRequest.result == UnityWebRequest.Result.Success)
            {
                var result = JsonUtility.FromJson<GetFurnitureOwnersMessage>(webRequest.downloadHandler.text);
                callback?.Invoke(result);
            }
            else
            {
                errorCallback?.Invoke(webRequest.error);
            }
        }

        public IEnumerator AddFurnitureOwner(int id, string ownerPlayFabId, Action callback = null, Action<string> errorCallback = null)
        {
            using UnityWebRequest webRequest = new($"{apiUri}/furniture/{id}/owner", "POST")
            {
                downloadHandler = new DownloadHandlerBuffer(),
                uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes("{\"ownerId\":\"" + ownerPlayFabId + "\"}")),
            };
            webRequest.SetRequestHeader("content-type", "application/json");
            webRequest.SetRequestHeader("x-playfab-auth-token", token);

            yield return webRequest.SendWebRequest();

            if (webRequest.result == UnityWebRequest.Result.Success)
            {
                callback?.Invoke();
            }
            else
            {
                errorCallback?.Invoke(webRequest.error + " - " + webRequest.downloadHandler.text);
            }
        }

        public IEnumerator AbandonFurnitureOwner(int id, Action callback = null, Action<string> errorCallback = null)
        {
            using UnityWebRequest webRequest = UnityWebRequest.Delete($"{apiUri}/furniture/{id}/owner");
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
    public class GetFurnitureOwnersMessage
    {
        public string[] owners;
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
    [Serializable]
    public class DuplicateTokenMessage
    {
        [SerializeField] public string token;
    }
}