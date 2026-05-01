//#pragma warning disable 649
using FurnitureNetwork;
//using PlayFab.PfEditor.EditorModels;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;

//using System.IO;
//using System.Net;
//using System.Runtime.InteropServices;
//using System.Security.Cryptography;


// using System.IO;
using System.Text.RegularExpressions;
using TMPro;
using TriLibCore.General;
using TriLibCore.SFB;
using TriLibCore.Utils;
//using UnityEditor.PackageManager;

// using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;
//using UnityEngine.UIElements;
//using UnityGoogleDrive;
using Slider = UnityEngine.UI.Slider;
//using TriLibCore.SFB; // Standalone File Browser namespace

namespace TriLibCore.Samples
{

    /// <summary>Represents a base class used in TriLib samples.</summary>
    public class AssetViewerBase : AbstractInputSystem
    {

        public string urlLink = "";
        public bool isDrive = false;
        public bool isLoadedBefore = false;
        public bool isDriveApiNew = false;
        public string PrivateApiFileId = string.Empty;
        public bool isPrivateApi = false; //Andrek

        public bool IsReplacingOldRoomOrignalUrl = false;
        public string OldRoomOrignalUrl = "";


        #region WebGLFilePicker
        //[DllImport("__Internal")]
        //private static extern void OpenFileDialogJS(string gameObjectName, string callbackMethodName);

        // Called when you want to open a file picker in the browser
        public void OpenFilePicker()
        {
            //#if UNITY_WEBGL && !UNITY_EDITOR
            //        // We pass our own gameObject name + the callback method we want the JS to call
            //        OpenFileDialogJS(gameObject.name, "OnFilePicked");
            //#else
            //            Debug.LogWarning("File picker only works in WebGL builds (in a browser).");
            //#endif


            string url = $"{UserAccountManager.m_FurnitureNetwork.apiUri}/api/v1/furniture";
            string token = UserAccountManager.m_FurnitureNetwork.token;

            if (BackgroundLevelInfo.instance != null)
            {
                if (!string.IsNullOrEmpty(BackgroundLevelInfo.instance.OriginUrl))
                {
                    OldRoomOrignalUrl = BackgroundLevelInfo.instance.OriginUrl;
                    IsReplacingOldRoomOrignalUrl = true;
                }
            }

            StartZipUpload(url, token);
        }

#if UNITY_WEBGL && !UNITY_EDITOR
   [System.Runtime.InteropServices.DllImport("__Internal")]
private static extern void OpenFileDialogAndUploadJS(
    string gameObjectName,
    string callbackMethodName,
    string uploadUrl,
    string token,
    string maxSizeBytes   // NEW – string is easiest for JS
);
#endif

        // For example, call this from a UI button
        public void StartZipUpload(string uploadUrl, string token)
        {
            const float fileMaxSize = 20 * 1024 * 1024;
#if UNITY_WEBGL && !UNITY_EDITOR
        // Pass this object's name and the callback method to JS
        OpenFileDialogAndUploadJS(gameObject.name, nameof(OnUploadComplete), uploadUrl, token, fileMaxSize.ToString());
#else
            //StandaloneFileBrowser.OpenFilePanelAsync("find you zip file", null, extensions, true, OnSkyboxStreamSelected);
            //
            var extensions = new[] { new ExtensionFilter("ZIP Files", "zip") };
            IList<ItemWithStream> files = StandaloneFileBrowser.OpenFilePanel("Select a ZIP File", "", extensions, false);

            if (files != null && files.Count > 0)
            {
                // We only asked for a single file (multiselect = false) so take files[0]
                ItemWithStream selectedFile = files[0];

                string selectedFileName = selectedFile.Name;


                //Debug.Log("Selected ZIP File Path: " + selectedFilePath);
                Debug.Log("Selected ZIP File Name: " + selectedFileName);



                StartCoroutine(UserAccountManager.m_FurnitureNetwork.UploadFurniture(selectedFileName, null, (result) => StartCoroutine(HandleReplacementAndAChangesOfTheRoom(result))));
            }
            else
            {
                Debug.Log("No file selected or invalid selection.");
            }

#endif
        }

        // This method is invoked by JS via "Module.SendMessage(gameObjectName, callbackMethodName, message)"
        public void OnUploadComplete(string message)
        {
            // Expecting message in these forms:
            // "PROGRESS|NN", "SUCCESS|<serverResponse>", or "ERROR|<errorInfo>"

            if (message.StartsWith("PROGRESS|"))
            {
                // e.g. "PROGRESS|47"
                string numberStr = message.Substring(9);
                if (int.TryParse(numberStr, out int progressValue))
                {
                    Debug.Log($"Upload progress: {progressValue}%");
                    // You could update a UI progress bar here
                }
                SetLoading(true);
                _loadingBar.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, Screen.width * (progressValue / 100f));
            }
            else if (message.StartsWith("SUCCESS|"))
            {
                SetLoading(false);
                string serverResp = message.Substring(8);
                Debug.Log($"Upload succeeded! Server response: {serverResp}");

                UploadFurnitureMessage result = JsonUtility.FromJson<UploadFurnitureMessage>(serverResp);



                StartCoroutine(HandleReplacementAndAChangesOfTheRoom(result));


                // Parse it or do something in your game
            }
            else if (message.StartsWith("ERROR|FileTooLarge|"))
            {
                // Format: ERROR|FileTooLarge|actual|max
                string[] parts = message.Split('|');
                if (parts.Length >= 4 &&
                    long.TryParse(parts[2], out long actual) &&
                    long.TryParse(parts[3], out long max))
                {
                    Debug.LogError($"File too large. Actual: {actual} bytes, Max: {max} bytes");
                    // Show a nice UI message in MB
                    SetLoading(false);
                }
                else
                {
                    Debug.LogError("File too large, but could not parse sizes: " + message); SetLoading(false);
                }
            }
            else if (message.StartsWith("ERROR|"))
            {
                string errorInfo = message.Substring(6);
                Debug.LogError($"Upload failed: {errorInfo}");
                SetLoading(false);
                // Show an error message to the user
            }
            else
            {
                Debug.Log($"Unknown message: {message}");
                SetLoading(false);
            }
        }


        private IEnumerator HandleReplacementAndAChangesOfTheRoom(UploadFurnitureMessage result)
        {
            if (IsReplacingOldRoomOrignalUrl)
            {
                yield return StartCoroutine(UserAccountManager.m_FurnitureNetwork.DeleteFurniture(
                  OldRoomOrignalUrl,
                  callback: () => Debug.Log("Removed"),
                  errorCallback: (err) => Debug.Log("Error")
                  ));
            }

            if (SessionInfo.RoomData != null)
            {
                if (SessionInfo.RoomData.RoomWrapper == null)
                {
                    SessionInfo.RoomData.RoomWrapper = new RoomJsonWrapper(result.id);
                }
                else
                {
                    SessionInfo.RoomData.RoomWrapper.OriginUrl = result.id;
                }
            }

            yield return StartCoroutine(UserAccountManager.Instance.SetUserDataRoutine("RoomDesign_" + SessionInfo.RoomData.RoomWrapper.SceneBaseID, SessionInfo.RoomData.RoomWrapper.ConvertToJSON()));

            // Will add new data to the server before downloading
            LoadModelFromFileWithIdFromPrivateServer(result.id);
        }

        public void OnFilePicked(string fileNameAndBase64)
        {
            if (string.IsNullOrEmpty(fileNameAndBase64))
            {
                Debug.LogError("No file data was received or user canceled the file picker.");
                return;
            }
            var separatorIndex = fileNameAndBase64.IndexOf('|');
            // Convert base64 to raw bytes
            //byte[] fileBytes = Convert.FromBase64String(fileNameAndBase64);

            string fileName = fileNameAndBase64.Substring(0, separatorIndex);
            string base64Data = fileNameAndBase64.Substring(separatorIndex + 1);
            byte[] fileBytes = Convert.FromBase64String(base64Data);
            // For demonstration, let's assume the user also picks a thumbnail or we
            // use a separate call. But here's how you'd do the actual upload next:

            UserAccountManager.m_FurnitureNetwork.UploadFurniture(
                fileBytes,
                fileName,
                System.IO.Path.GetExtension(fileName).TrimStart('.'),
                callback: (res) => LoadModelFromFileWithIdFromPrivateServer(res.id),
                errorCallback: err => Debug.LogError($"Upload failed: {err}"));
        }



        //public void OnFilePicked(string fileNameAndBase64)
        //{
        //    if (string.IsNullOrEmpty(fileNameAndBase64))
        //    {
        //        Debug.LogError("No file data or user canceled the file picker.");
        //        return;
        //    }

        //    // We expect fileNameAndBase64 = "filename|base64string"
        //    var separatorIndex = fileNameAndBase64.IndexOf('|');
        //    if (separatorIndex < 0)
        //    {
        //        Debug.LogError("Could not find separator in file data string.");
        //        return;
        //    }

        //    // Extract file name and base64 data
        //    string fileName = fileNameAndBase64.Substring(0, separatorIndex);
        //    string base64Data = fileNameAndBase64.Substring(separatorIndex + 1);

        //    byte[] fileBytes = Convert.FromBase64String(base64Data);

        //    // For demonstration: Upload the file
        //    StartCoroutine(UploadFurnitureCoroutine(
        //        fileBytes,
        //        fileName,
        //        "application/octet-stream", // or something more specific if you want
        //        onSuccess: () => Debug.Log("Upload succeeded!"),
        //        onError: err => Debug.LogError($"Upload failed: {err}")
        //    ));
        //}

        //// Your upload logic
        //private System.Collections.IEnumerator UploadFurnitureCoroutine(
        //    byte[] fileData,
        //    string fileName,
        //    string mimeType,
        //    Action onSuccess = null,
        //    Action<string> onError = null
        //)
        //{
        //    // Build the form
        //    var form = new WWWForm();
        //    form.AddBinaryData("file", fileData, fileName, mimeType);

        //    // Example upload
        //    using var webRequest = UnityEngine.Networking.UnityWebRequest.Post("https://example.com/furniture", form);
        //    webRequest.SetRequestHeader("x-playfab-auth-token", "YourAuthTokenValue");

        //    yield return webRequest.SendWebRequest();

        //    if (webRequest.result == UnityEngine.Networking.UnityWebRequest.Result.Success)
        //    {
        //        onSuccess?.Invoke();
        //    }
        //    else
        //    {
        //        onError?.Invoke(webRequest.error);
        //    }
        //}
        #endregion

        /// <summary>Gets the Asset Viewer Singleton instance.</summary>
        public static AssetViewerBase Instance { get; private set; }

        /// <summary>
        /// Model/skybox loading bar. (Used on platforms with async capabilities)
        /// </summary>
        [SerializeField]
        private RectTransform _loadingBar;

        /// <summary>
        /// Help box wrapper.
        /// </summary>
        [SerializeField]
        private GameObject _helpWrapper;

        /// <summary>
        /// Loading screen wrapper. (Used on platforms without async capabilities)
        /// </summary>
        [SerializeField]
        private GameObject _loadingWrapper;

        /// <summary>
        /// Model URL loading dialog.
        /// </summary>
        [SerializeField]
        private GameObject _modelUrlDialog;

        /// <summary>
        ///  Model URL loading Input Field.
        /// </summary>
        [SerializeField]
        private TMP_InputField _modelUrl;

        /// <summary>
        /// Animation playback slider.
        /// </summary>
        [SerializeField]
        protected Slider PlaybackSlider;

        /// <summary>
        /// Animation playback time.
        /// </summary>
        [SerializeField]
        protected Text PlaybackTime;

        /// <summary>
        /// Animation selector.
        /// </summary>
        [SerializeField]
        protected Dropdown PlaybackAnimation;

        /// <summary>
        /// Play button.
        /// </summary>
        [SerializeField]
        protected Selectable Play;

        /// <summary>
        /// Stop button.
        /// </summary>
        [SerializeField]
        protected Selectable Stop;

        /// <summary>
        /// Options used in this sample.
        /// </summary>
        protected AssetLoaderOptions AssetLoaderOptions;

        /// <summary>
        /// Current camera pitch and yaw angles.
        /// </summary>
        public Vector2 CameraAngle;

        /// <summary>
        /// Loaded game object.
        /// </summary>
        public GameObject RootGameObject { get; protected set; }

        /// <summary>
        /// Mouse input multiplier.
        /// Higher values will make the mouse movement more sensible.
        /// </summary>
        protected const float InputMultiplierRatio = 0.1f;

        /// <summary>
        /// Maximum camera pitch and light pitch (rotation around local X-axis).
        /// </summary>
        protected const float MaxPitch = 80f;

        /// <summary>
        /// The AssetLoaderFilePicker instance created for this viewer.
        /// </summary>
        protected AssetLoaderFilePicker FilePickerAssetLoader;

        /// <summary>
        /// Holds the peak memory used to load the model.
        /// </summary>
        protected long PeakMemory;


        [SerializeField] public TextMeshProUGUI TMPUGUI;

        [SerializeField] public TextMeshProUGUI TMP_RoomName;

        [SerializeField] public TMP_InputField RoomName;
        [SerializeField] public GameObject ChangeNameFrameWrapper;

        [SerializeField] public GameObject AfterLoadButtons;

        public bool isLoadAutomatically;
#if TRILIB_SHOW_MEMORY_USAGE
        /// <summary>
        /// Holds the peak managed memory used to load the model.
        /// </summary>
        protected long PeakManagedMemory;
#endif
        /// <summary>
        /// A flag representing if the model is loading or not.
        /// </summary>
        private bool _loading;

        /// <summary>Updates the Camera based on mouse Input.</summary>
        protected void UpdateCamera()
        {
            CameraAngle.x = Mathf.Repeat(CameraAngle.x + GetAxis("Mouse X"), 360f);
            CameraAngle.y = Mathf.Clamp(CameraAngle.y + GetAxis("Mouse Y"), -MaxPitch, MaxPitch);
        }

        /// <summary>
        /// Shows the help box.
        /// </summary>
        public void ShowHelp()
        {
            _helpWrapper.SetActive(true);
        }

        /// <summary>
        /// Hides the help box.
        /// </summary>
        public void HideHelp()
        {
            _helpWrapper.SetActive(false);
        }

        /// <summary>
        /// Shows the model URL dialog.
        /// </summary>
        public void ShowModelUrlDialog()
        {
            _modelUrlDialog.SetActive(true);
            _modelUrl.Select();
            _modelUrl.ActivateInputField();
        }

        public void ShowModelUrlDialogNormal()
        {
            isDrive = false;
            isDriveApiNew = false;
            isPrivateApi = false;
            ShowModelUrlDialog();
        }

        public void ShowModelUrlDialogDrive()
        {
            isDrive = true;
            isDriveApiNew = false;
            isPrivateApi = false;
            ShowModelUrlDialog();
        }

        public void ShowModelUrlDialogDriveNewApi()
        {
            isDrive = false;
            isDriveApiNew = true;
            isPrivateApi = false;
            ShowModelUrlDialog();

        }

        public void ShowModelUrlDialogPrivateApi()
        {
            isDrive = false;
            isDriveApiNew = false;
            isPrivateApi = true;
            ShowModelUrlDialog();
        }

        public void ShowDialogChangeName()
        {
            ChangeNameFrameWrapper.gameObject.SetActive(true);
            RoomName.gameObject.SetActive(true);
            RoomName.Select();
            RoomName.ActivateInputField();
        }

        public void ConfirmChangeName()
        {
            if (RoomName != null && (RoomName.text.Length != 0))
            {

                TMP_RoomName.text = RoomName.text;
                HidDialogChangeName();
                if (isLoadedBefore)
                {

                    var fw = SessionInfo.RoomData.RoomWrapper;
                    fw.SceneName = TMP_RoomName.text;
                    UserAccountManager.Instance.SetUserData("RoomDesign_" + fw.SceneBaseID, fw.ConvertToJSON());
                }
            }

        }


        public void HidDialogChangeName()
        {
            ChangeNameFrameWrapper.gameObject.SetActive(false);
            RoomName = null;
        }
        /// <summary>
        /// Hides the model URL dialog.
        /// </summary>
        public void HideModelUrlDialog()
        {
            _modelUrlDialog.SetActive(false);
            _modelUrl.text = null;
        }

        public void UploadFileToPrivateServer()
        {
            SetLoading(false);
            FilePickerAssetLoader = AssetLoaderFilePicker.Create();
            //FilePickerAssetLoader.LoadModelFromFilePickerAsync(
        }



        protected void LoadModelFromFileWithIdFromPrivateServer(string id)
        {
            Debug.Log("loading id:" + id);
            UnityWebRequest uwr = UserAccountManager.m_FurnitureNetwork.GenerateDownloadRequest(id);
            urlLink = id;
            PrivateApiFileId = id;
            CustomLoadModelFromURL(uwr);
        }

        // P5 self-healing load. Use this overload whenever sceneBaseId is known
        // (i.e. the load was triggered by reading a RoomDesign_<sceneBaseId> key
        // out of PlayFab). HEADs the server first; on 404, if
        // autoRemoveStaleKey is true the stale PlayFab key is deleted
        // automatically. Default is false: the load is aborted but the key is
        // left in place so the caller can prompt the user for confirmation
        // before deleting.
        protected void LoadModelFromFileWithIdFromPrivateServer(string id, string sceneBaseId, bool autoRemoveStaleKey = false)
        {
            if (string.IsNullOrEmpty(sceneBaseId))
            {
                LoadModelFromFileWithIdFromPrivateServer(id);
                return;
            }
            StartCoroutine(UserAccountManager.m_FurnitureNetwork.CheckFurnitureExists(
                id,
                onFound: () => LoadModelFromFileWithIdFromPrivateServer(id),
                onMissing: () =>
                {
                    if (autoRemoveStaleKey)
                    {
                        Debug.LogWarning($"Furniture {id} no longer exists on server; removing stale PlayFab key RoomDesign_{sceneBaseId}");
                        UserAccountManager.Instance.RemoveUserData("RoomDesign_" + sceneBaseId);
                    }
                    else
                    {
                        Debug.LogWarning($"Furniture {id} no longer exists on server; stale PlayFab key RoomDesign_{sceneBaseId} left in place (autoRemoveStaleKey=false)");
                    }
                    SetLoading(false);
                },
                onError: (err) =>
                {
                    Debug.LogError($"Existence check failed for furniture {id}: {err}; attempting load anyway");
                    LoadModelFromFileWithIdFromPrivateServer(id);
                }
            ));
        }

        //protected void 

        /// <summary>
        /// Shows the file picker for loading a model from local file-system.
        /// </summary>
        protected void LoadModelFromFile(GameObject wrapperGameObject = null, Action<AssetLoaderContext> onMaterialsLoad = null)
        {
            SetLoading(false);
            FilePickerAssetLoader = AssetLoaderFilePicker.Create();
            FilePickerAssetLoader.LoadModelFromFilePickerAsync("Select a File", OnLoad, onMaterialsLoad ?? OnMaterialsLoad, OnProgress, OnBeginLoadModel, OnError, wrapperGameObject ?? gameObject, AssetLoaderOptions);
        }

        public void LoadOldModelFastFromURL(string url)
        {
            var request = AssetDownloader.CreateWebRequest(url);
            CustomLoadModelFromURL(request);
        }
        /// <summary>
        /// Loads a model from a URL.
        /// </summary>
        protected void LoadModelFromURL(UnityWebRequest request, string fileExtension, GameObject wrapperGameObject = null, object customData = null, Action<AssetLoaderContext> onMaterialsLoad = null)
        {
            if (string.IsNullOrWhiteSpace(fileExtension))
            {
                throw new Exception("TriLib could not determine the given model extension.");
            }
            HideModelUrlDialog();
            SetLoading(true);
            OnBeginLoadModel(true);
            fileExtension = fileExtension.ToLowerInvariant();
            var isZipFile = fileExtension == "zip" || fileExtension == ".zip";
            AssetDownloader.LoadModelFromUri(request, OnLoad, onMaterialsLoad ?? OnMaterialsLoad, OnProgress, OnError, wrapperGameObject, AssetLoaderOptions, customData, isZipFile ? null : fileExtension, isZipFile);
        }
        protected void CustomLoadModelFromURL(UnityWebRequest request, string fileExtension = null, GameObject wrapperGameObject = null, object customData = null, Action<AssetLoaderContext> onMaterialsLoad = null)
        {
            // if (string.IsNullOrWhiteSpace(fileExtension))
            // {
            //     throw new Exception("TriLib could not determine the given model extension.");
            // }
            HideModelUrlDialog();
            SetLoading(true);
            OnBeginLoadModel(true);
            fileExtension = ".zip";
            var isZipFile = fileExtension == "zip" || fileExtension == ".zip";

            AssetDownloader.LoadModelFromUri(request, OnLoad, onMaterialsLoad ?? OnMaterialsLoad, OnProgress, OnError, wrapperGameObject, AssetLoaderOptions, customData, isZipFile ? null : fileExtension, isZipFile);
        }

        /*protected void CustomLoadModelFromDriveURL(GoogleDriveFiles.DownloadRequest request,
            string fileExtension = null, GameObject wrapperGameObject = null, object customData = null,
            Action<AssetLoaderContext> onMaterialsLoad = null)
        {
            HideModelUrlDialog();

            SetLoading(true);
            OnBeginLoadModel(true);
            fileExtension = ".zip";
            var isZipFile = fileExtension == "zip" || fileExtension == ".zip";
            AssetDownloader.LoadModelFromUri(request, OnLoad, onMaterialsLoad ?? OnMaterialsLoad, OnProgress, OnError, wrapperGameObject, AssetLoaderOptions, customData, isZipFile ? null : fileExtension, isZipFile);
        }*/

        //public IEnumerator TestFileDownloadApi(string id)
        //{
        //    var request = GoogleDriveFiles.Download(id);
        //    request.AcknowledgeAbuse = true;

        //    yield return request.Send();
        //    print(request.IsError);
        //    print(request.ResponseData.Content.Length);
        //    TMPUGUI.text = "error : " + request.IsError + "\n" + "content : " + request.ResponseData.Content;
        //}




        protected void LoadModelFromURLWithDialogValues2()
        {

        }


        //******* Depricaated
        /// <summary>
        /// Shows the URL selector for loading a model from network.
        /// </summary>
        protected void LoadModelFromURLWithDialogValues()
        {


            if (isPrivateApi)
            {
                //if (!isLoadedBefore)
                //{
                //    //urlLink = _modelUrl.text.Trim();
                //}
                //else
                //{

                //}


                LoadModelFromFileWithIdFromPrivateServer(urlLink, SessionInfo.RoomData?.RoomWrapper?.SceneBaseID);
            }
            else if (isDriveApiNew && isLoadedBefore && isLoadAutomatically)
            {
                //string fileId = GetFileIdFromLink(urlLink);
                //var request = GoogleDriveFiles.Download(fileId);
                //request.AcknowledgeAbuse = true;
                //try
                //{
                //    // CustomLoadModelFromDriveURL(request);
                //    Debug.LogError("Google Drive is no longer supported");
                //}
                //catch (Exception e)
                //{
                //    HideModelUrlDialog();
                //    OnError(new ContextualizedError<object>(e, null));
                //}
            }
            // print("here");
            else if (isDriveApiNew)
            {
                //urlLink = _modelUrl.text.Trim();
                //string fileId = GetFileIdFromLink(urlLink);
                //// StartCoroutine(TestFileDownloadApi(fileId));

                //var request = GoogleDriveFiles.Download(fileId);
                //request.AcknowledgeAbuse = true;
                //try
                //{
                //    Debug.LogError("Google Drive is no longer supported");
                //    //CustomLoadModelFromDriveURL(request);

                //}
                //catch (Exception e)
                //{
                //    HideModelUrlDialog();
                //    OnError(new ContextualizedError<object>(e, null));
                //}

            }
            else if (isLoadedBefore)
            {
                if (string.IsNullOrWhiteSpace(urlLink))
                {
                    return;
                }
                var request = AssetDownloader.CreateWebRequest(urlLink);
                // var fileExtension = FileUtils.GetFileExtension(request.uri.Segments[request.uri.Segments.Length - 1], false);
                // Debug.Log("file extebsion:" + fileExtension);
                try
                {
                    CustomLoadModelFromURL(request);
                    // LoadModelFromURL(request,fileExtension);
                }
                catch (Exception e)
                {
                    HideModelUrlDialog();
                    OnError(new ContextualizedError<object>(e, null));
                }
            }
            else if (isDrive)
            {

                //https://drive.usercontent.google.com/download?id=11p46K7Aa0xGEoXR4mW9OZilK23lmdzgb&export=download&authuser=0
                //https://drive.google.com/file/d/11p46K7Aa0xGEoXR4mW9OZilK23lmdzgb/view



                string prefixGoogleUrl = "https://drive.usercontent.google.com/download?id=";
                string suffixGoogleUrl = "&export=download&authuser=0";
                string googleUrl = prefixGoogleUrl + GetFileIdFromLink(_modelUrl.text.Trim()) + suffixGoogleUrl;
                urlLink = googleUrl;
                if (string.IsNullOrWhiteSpace(googleUrl))
                {
                    return;
                }
                var request = AssetDownloader.CreateWebRequest(googleUrl);
                // var fileExtension = FileUtils.GetFileExtension(request.uri.Segments[request.uri.Segments.Length - 1], false);
                // Debug.Log("file extebsion:" + fileExtension);
                try
                {
                    CustomLoadModelFromURL(request);
                    // LoadModelFromURL(request,fileExtension);
                }
                catch (Exception e)
                {
                    HideModelUrlDialog();
                    OnError(new ContextualizedError<object>(e, null));
                }
            }
            else
            {
                if (string.IsNullOrWhiteSpace(_modelUrl.text))
                {
                    return;
                }
                var request = AssetDownloader.CreateWebRequest(_modelUrl.text.Trim());
                var fileExtension = FileUtils.GetFileExtension(request.uri.Segments[request.uri.Segments.Length - 1], false);
                // Debug.Log("file extebsion:" + fileExtension);
                try
                {
                    // CustomLoadModelFromURL(request);
                    CustomLoadModelFromURL(request);
                }
                catch (Exception e)
                {
                    HideModelUrlDialog();
                    OnError(new ContextualizedError<object>(e, null));
                }
            }

        }


        public static string GetFileIdFromLink(string url)
        {
            string pattern = @"\/d\/([a-zA-Z0-9_-]+)\/";
            Regex regex = new Regex(pattern);
            Match match = regex.Match(url);

            if (match.Success && match.Groups.Count > 1)
            {
                return match.Groups[1].Value;
            }

            return null;
        }
        protected void LoadModelFromGoogleDrive()
        {
            if (string.IsNullOrWhiteSpace(_modelUrl.text))
            {
                return;
            }
            var request = AssetDownloader.CreateWebRequest(_modelUrl.text.Trim());
            var fileExtension = "zip";
            // Debug.Log("file extebsion:" + fileExtension);
            try
            {
                CustomLoadModelFromURL(request);
                // LoadModelFromURL(request,fileExtension);
            }
            catch (Exception e)
            {
                HideModelUrlDialog();
                OnError(new ContextualizedError<object>(e, null));
            }
        }
        /// <summary>Event triggered when the user selects a file or cancels the Model selection dialog.</summary>
        /// <param name="hasFiles">If any file has been selected, this value is <c>true</c>, otherwise it is <c>false</c>.</param>
        protected virtual void OnBeginLoadModel(bool hasFiles)
        {
            if (hasFiles)
            {
                if (RootGameObject != null)
                {
                    Destroy(RootGameObject);
                }
                SetLoading(true);
            }
        }

        /// <summary>
        /// Enables/disables the loading flag.
        /// </summary>
        /// <param name="value">The new loading flag.</param>
        protected void SetLoading(bool value)
        {
#if UNITY_2023_3_OR_NEWER
            var selectables = FindObjectsByType<Selectable>(FindObjectsSortMode.None);
#else
            var selectables = FindObjectsOfType<Selectable>();
#endif
            for (var i = 0; i < selectables.Length; i++)
            {
                var button = selectables[i];
                button.interactable = !value;
            }
            _loadingWrapper.gameObject.SetActive(value);
            _loadingBar.gameObject.SetActive(value);
            _loading = value;
        }

        /// <summary>
        /// Gets a flag indicating whether the model is loading or not.
        /// </summary>
        /// <returns>The loading flag.</returns>
        protected bool IsLoading()
        {
            return _loading;
        }

        /// <summary>Checks if the Dispatcher instance exists and stores this class instance as the Singleton.</summary>
        protected virtual void Start()
        {
            Dispatcher.CheckInstance();
            PasteManager.CheckInstance();
            Instance = this;
        }

        /// <summary>Event that is triggered when the Model loading progress changes.</summary>
        /// <param name="assetLoaderContext">The Asset Loader Context reference. Asset Loader Context contains the Model loading data.</param>
        /// <param name="value">The loading progress, ranging from 0 to 1.</param>
        protected virtual void OnProgress(AssetLoaderContext assetLoaderContext, float value)
        {
            _loadingBar.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, Screen.width * value);
        }

        /// <summary>Event that is triggered when any error occurs.</summary>
        /// <param name="contextualizedError">The Contextualized Error that has occurred.</param>
        protected virtual void OnError(IContextualizedError contextualizedError)
        {
            Debug.LogError(contextualizedError);
            //Debug.LogError);
            RootGameObject = null;
            SetLoading(false);
        }

        /// <summary>Event that is triggered when the Model Meshes and hierarchy are loaded.</summary>
        /// <param name="assetLoaderContext">The Asset Loader Context reference. Asset Loader Context contains the Model loading data.</param>
        protected virtual void OnLoad(AssetLoaderContext assetLoaderContext)
        {
            PeakMemory = 0;
#if TRILIB_SHOW_MEMORY_USAGE
            PeakManagedMemory = 0;
#endif
        }

        /// <summary>Event is triggered when the Model (including Textures and Materials) has been fully loaded.</summary>
        /// <param name="assetLoaderContext">The Asset Loader Context reference. Asset Loader Context contains the Model loading data.</param>
        protected virtual void OnMaterialsLoad(AssetLoaderContext assetLoaderContext)
        {
            SetLoading(false);
        }

        /// <summary>
        /// Plays the selected animation.
        /// </summary>
        public virtual void PlayAnimation()
        {
        }

        /// <summary>Stops playing the selected animation.</summary>
        public virtual void StopAnimation()
        {
        }

        /// <summary>Switches to the animation selected on the Dropdown.</summary>
        /// <param name="index">The selected Animation index.</param>
        public virtual void PlaybackAnimationChanged(int index)
        {
        }

        /// <summary>
        /// Event triggered when the animation slider value has been changed by the user.
        /// </summary>
        /// <param name="value">The Animation playback normalized position.</param>
        public virtual void PlaybackSliderChanged(float value)
        {
        }


        public void LoadFromDriveApi()
        {

        }




    }
}