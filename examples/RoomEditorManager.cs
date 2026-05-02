using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System.IO;
using System.Linq;


public class RoomEditorManager : MonoBehaviour
{
    //#if UNITY_WEBGL || UNITY_STANDALONE

    //#else
    [SerializeField] RoomArPlacement_Collection_So collecion;
    //#endif
    //private void Start()
    //{

    //}

    private RoomJsonWrapper CurrentJSONWrapper;
    private void Start()
    {
        if (collecion == null)
        {
            collecion = RoomArPlacement_Collection_MainRuntime.instance.collecion;
        }
        if (UserAccountManager.Instance != null)
        {
            UserAccountManager.OnUserDataSet.AddListener(UserAccountManager_OnUserDataSet);
            UserAccountManager.OnUserDataError.AddListener(UserAccountManager_OnUserDataError);
        }
    }

    public void OnUploadDataPressed()
    {

#if UNITY_WEBGL || UNITY_STANDALONE
        collecion.CurrentFurnitureManager.Value.LockAllFurniture();
#endif
        if (LoadingScreen.instance != null)
        {
            LoadingScreen.instance.SetLoading(true);
        }




#if UNITY_WEBGL || UNITY_STANDALONE

        RoomJsonWrapper jsonListWrapper = new RoomJsonWrapper(collecion.FurnitureManager_ScriptableList.Select(go => go.transform).ToList());
        // Full-res screenshot (for your server)
        Texture2D fullRes = ScreenShotTaker.instance.TakeFullResScreenshot();

        // Small thumbnail (for PlayFab JSON)
        Texture2D smallThumb = TextureUtils.Downscale(fullRes, 4);

        // Store reduced image in wrapper (PlayFab)
        // If you want smallest size, consider JPG instead of PNG:
        // jsonListWrapper.SaveSceneThumbnail(smallThumb.EncodeToJPG(75));
        jsonListWrapper.SaveSceneThumbnail(smallThumb.EncodeToJPG(75));

#else
        
        RoomJsonWrapper jsonListWrapper = SessionInfo.RoomData.RoomWrapper.CloneSameID();
        List<Transform> FurnitureParents = collecion.FurnitureParentList.Select(go => go.transform).ToList();
        jsonListWrapper.MultipleStylesFurnitureJsonDetails.Clear();
        foreach (Transform child in FurnitureParents)
        {
            var furnitures = new List<FurnitureJsonDetails>();
            for (int i = 0; i < child.childCount; i++)
            {
                // Debug.Log(ParentFurniture.GetChild(i).name);
                furnitures.Add(new FurnitureJsonDetails(child.GetChild(i).gameObject.GetComponent<FurnitureObject>()));
            }
            jsonListWrapper.MultipleStylesFurnitureJsonDetails.Add(furnitures);
        }
       
#endif
        string jsonData = jsonListWrapper.ConvertToJSON();
        CurrentJSONWrapper = jsonListWrapper;
        jsonListWrapper.LastOpenedUtc = DateTime.Now;
        // Upload JSON to PlayFab
        UserAccountManager.Instance.SetUserData("RoomDesign_" + jsonListWrapper.SceneBaseID, jsonData);

#if UNITY_WEBGL || UNITY_STANDALONE
        // Upload full-res to your server
        StartCoroutine(
            UserAccountManager.m_FurnitureNetwork.UpdateFurnitureThumbnail(
                int.Parse(jsonListWrapper.OriginUrl),
                fullRes,
                () =>
                {
                    Debug.Log("Thumbnail updated!");
                    LoadingScreen.instance.SetLoading(false);
                },
                err =>
                {
                    Debug.LogError($"Thumbnail update failed: {err}");
                    LoadingScreen.instance.SetLoading(false);
                }
            )
        );

        // Cleanup (optional but recommended to avoid memory buildup)
        Destroy(smallThumb);
#endif
        // Only destroy fullRes IF you are sure UpdateFurnitureThumbnail doesn't need it later.
        // If UpdateFurnitureThumbnail encodes immediately inside the coroutine, it's safe to destroy after a frame:
        // StartCoroutine(DestroyNextFrame(fullRes));
    }

    // Optional helper if you want safe delayed destroy for fullRes:
    private IEnumerator DestroyNextFrame(Texture2D tex)
    {
        yield return null;
        if (tex != null) Destroy(tex);
    }



    public void UserAccountManager_OnUserDataSet(string messege)
    {
        if (NotificationWindow.instance != null && CurrentJSONWrapper!=null)
        {
            NotificationWindow.instance.OnNotificationStarts(CurrentJSONWrapper.SceneName + " has been saved.", 5);
        }
        if (LoadingScreen.instance != null)
        {
            LoadingScreen.instance.SetLoading(false);
        }
    }
    public void UserAccountManager_OnUserDataError(string messege)
    {
        if (NotificationWindow.instance != null && CurrentJSONWrapper != null)
        {
            NotificationWindow.instance.OnNotificationStarts(CurrentJSONWrapper.SceneName + " has encountered an error during saving.", 5);
        }
        if (LoadingScreen.instance != null)
        {
            LoadingScreen.instance.SetLoading(false);
        }
    }

    public void OnSaveScreenshotToAppDataTest()
    {
        StartCoroutine(SaveScreenshotToAppDataCoroutine());
    }

    private IEnumerator SaveScreenshotToAppDataCoroutine()
    {
        // Wait for end of frame to be sure the frame is fully rendered
        yield return new WaitForEndOfFrame();

        // Reuse your existing screenshot logic
        Texture2D texture2D = ScreenShotTaker.instance.TakeFullResScreenshot();

        // Encode as JPG (quality 80 is usually good enough)
        byte[] jpgBytes = texture2D.EncodeToJPG(90);

        // Build folder & file path in app data
        string folderPath = Path.Combine(Application.persistentDataPath, "TestScreenshots");
        if (!Directory.Exists(folderPath))
        {
            Directory.CreateDirectory(folderPath);
        }

        string sceneName = CurrentJSONWrapper != null && !string.IsNullOrEmpty(CurrentJSONWrapper.SceneName)
            ? CurrentJSONWrapper.SceneName
            : "RoomDesign";

        string fileName = $"{sceneName}_{DateTime.Now:yyyyMMdd_HHmmss}.jpg";
        string fullPath = Path.Combine(folderPath, fileName);

        // Write file
        File.WriteAllBytes(fullPath, jpgBytes);

        // Optional: clean up texture if you don't need it anymore
        Destroy(texture2D);

        // Let yourself know where it went
        NotificationWindow.instance.OnNotificationStarts(
            $"Test screenshot saved:\n{fullPath}", 5);
    }




    // public void OnLoadDataPressed()
    // {
    //    SavedData.LoadLastScene();
    //    Debug.Log("done Loading");
    // }

    public static class TextureUtils
    {
        public static Texture2D Downscale(Texture2D source, int divisor = 3, FilterMode filter = FilterMode.Bilinear)
        {
            if (source == null) return null;

            int newW = Mathf.Max(1, source.width / divisor);
            int newH = Mathf.Max(1, source.height / divisor);

            var prevFilter = source.filterMode;
            source.filterMode = filter;

            RenderTexture rt = RenderTexture.GetTemporary(newW, newH, 0, RenderTextureFormat.ARGB32);
            RenderTexture prev = RenderTexture.active;

            Graphics.Blit(source, rt);
            RenderTexture.active = rt;

            Texture2D result = new Texture2D(newW, newH, TextureFormat.RGBA32, false);
            result.ReadPixels(new Rect(0, 0, newW, newH), 0, 0);
            result.Apply(false, false);

            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);

            source.filterMode = prevFilter;

            return result;
        }
    }
}

