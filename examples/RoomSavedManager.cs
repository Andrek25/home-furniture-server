using PlayFab.ClientModels;
using System;
using System.Collections;
using System.Collections.Generic;
#if !UNITY_ANDROID
using System.Runtime.InteropServices;
#endif
using System.Web;
using TMPro;
//using UnityEditor.PackageManager;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Networking;
using UnityEngine.SceneManagement;

public enum RoomSavedManagerDic
{
    MyHomes = 0,
    Shared = 1,
    Invited = 2,
}
[SerializableAttribute]
public enum RoomSavedLeaveSceneAction
{
    None = 0,
    UploadNew = 1,
    LoadOldRoom = 2,
    LoadLink = 3,
    EnterAr = 4,
    LoadLinkAR = 5
}

public enum SessionType
{
    Local = 0,
    CreateMultiplayer = 1,
    JoinMultiplayer = 2,
}

public class RoomSavedManager : MonoBehaviour
{

    public static RoomSavedManager instance;
    //public RoomJsonWrapper FurnitureWrapper;

    //public bool isLoadedScene = false;
    //public bool isLoadAutomatically = false;
    public Transform UploadTestButton;


    public Transform ExportedUrlWindowPanel;
    public TMP_InputField ExportedUrlInputField;

    public TMP_InputField EnteredLinkOfSharedRoom;
    public GameObject LinkSharingWrapper;


    private string tokenArgName = "Room";

    private string KeyInUrl;
    private string DataInUrl;

    private string UsernameInUrl;

    public GameObject LoadingWrapper;


    string SimpleEncKey = "0123456789abcdef";
    string SimpleEncIv = "abcdef0123456789";


    private bool IsOwenedByCurrentUser;

#if UNITY_WEBGL
    [DllImport("__Internal")] private static extern void CopyToClipboard(string text);
    // [DllImport("__Internal")] private static extern void PasteFromClipboard(Action<IntPtr> callback);
    [DllImport("__Internal")] private static extern void ChangeURL(string newUrl);
#endif
    public Dictionary<string, RoomJsonWrapper> MyHomesListWrappers;
    public Dictionary<string, RoomJsonWrapper> SharedListWrappers;
    public Dictionary<string, RoomJsonWrapper> InvitedListWrappers;


    public RoomSavedManagerDic currentchoosenFurnitureJSONListWrapper;

    public UnityEvent OnUpdateNewData;
    public UnityEvent<List<string>> OnUpdateRemoveDataList;

    public Transform MyHomesOn;
    public Transform MyHomesOff;

    public Transform InvitedOn;
    public Transform InvitedOff;

    public string KeyLoadedAndAdded;
    public NotificationWindow notificationWindow;


    public bool IsMultiplayerSession;

    public RectTransform LocalOrMultiplayerFrameWrapper;
    public RectTransform CreateRoomFrameWrapper;
    public RectTransform JoinRoomFrameWrapper;


    public RoomJsonWrapper ChoosenJsonRoomWrapper;
    public RoomSavedLeaveSceneAction NextRoomActionType;
    //public MultiplayerRoomSavedWrapper MultiplayerRoomSavedDetails;

    public TMP_InputField RoomNameMultiCreation;
    public TMP_InputField RoomPassMultiCreation;

    public bool IsJoining;

    public Dictionary<string, string> RegionTable;
    public TMP_Dropdown RegionDropdown;
    public TMP_Dropdown RegionDropdownJoin;

    List<string> DeletedRoomList = new List<string>();

    private void Awake()
    {

        if (RoomSavedManager.instance != null)
        {
            Destroy(RoomSavedManager.instance.gameObject);
        }
        if (DeletedRoomList == null)
        {
            DeletedRoomList = new List<string>();
        }
        instance = this;
    }

    public void Start()
    {
        // string RoomKey = TestLoadedProject();
        //
        // if (RoomKey != null)
        // {  
        //    // Debug.Log();
        // }

        UserAccountManager.OnUserIdRetrieved.AddListener(UserAccountManager_OnUserIdRetrieved);
        UserAccountManager.OnUserSpecificDataRetrieved.AddListener(UserAccountManager_RetrievedSpecificData);
        UserAccountManager.OnUserDataSet.AddListener(ReloadLists);
        UserAccountManager.OnUserIdError.AddListener(UserAccountManager_OnUserIdError);


        UserAccountManager.OnUserSpecificDataError.AddListener(OnError);

        if (DeepLinkManager.Instance != null)
        {
            DeepLinkManager.Instance.OnDeepLinkTriggeredAndProccesed.AddListener(OnDeepLinkActivatedHandler);

            string currentPlayer = DeepLinkManager.Instance.CurrentPlayer;
            string currentRoom = DeepLinkManager.Instance.CurrentRoom;
            if (!String.IsNullOrEmpty(currentPlayer) && !String.IsNullOrEmpty(currentRoom) && !DeepLinkManager.Instance.IsOpened)
            {
                DeepLinkManager.Instance.IsOpened = true;
                UserAccountManager.Instance.GetUserDataSpecificWithUsername(currentPlayer, "RoomDesign_" + currentRoom);
            }
        }

        // UserAccountManager.OnUserDataRetrieved.AddListener(OnUserDataRetrievedHandler);
        MyHomesListWrappers = new Dictionary<string, RoomJsonWrapper>();
        SharedListWrappers = new Dictionary<string, RoomJsonWrapper>();
        InvitedListWrappers = new Dictionary<string, RoomJsonWrapper>();
        // string RoomKey  = TestLoadedProject();
        //
        // if (RoomKey != null)
        // {
        //    LoadingWrapper.gameObject.SetActive(true);
        //    UserAccountManager.Instance.GetUserDataSpecificWithUsername(UsernameInUrl,KeyInUrl);
        // }
        if (SessionInfo.instance != null && !SessionInfo.instance.IsLinkInUrlLoadedBefore)
        {
            SessionInfo.instance.IsLinkInUrlLoadedBefore = true;
            TryOpeningUrlRoom();
        }



        UpdateButtons();
        ReloadLists("");



        SetupRegionTable();
        FillRegionDropTable();
    }

    private void OnDeepLinkActivatedHandler()
    {
        string currentPlayer = DeepLinkManager.Instance.CurrentPlayer;
        string currentRoom = DeepLinkManager.Instance.CurrentRoom;
        if (!String.IsNullOrEmpty(currentPlayer) && !String.IsNullOrEmpty(currentRoom) && !DeepLinkManager.Instance.IsOpened)
        {
            DeepLinkManager.Instance.IsOpened = true;
            UserAccountManager.Instance.GetUserDataSpecificWithUsername(currentPlayer, "RoomDesign_" + currentRoom);
        }
    }

    private void OnDestroy()
    {

        UserAccountManager.OnUserIdRetrieved.RemoveListener(UserAccountManager_OnUserIdRetrieved);
        UserAccountManager.OnUserSpecificDataRetrieved.RemoveListener(UserAccountManager_RetrievedSpecificData);
        UserAccountManager.OnUserDataSet.RemoveListener(ReloadLists);
        UserAccountManager.OnUserIdError.RemoveListener(UserAccountManager_OnUserIdError);

        if (DeepLinkManager.Instance != null)
        {
            DeepLinkManager.Instance.OnDeepLinkTriggeredAndProccesed.RemoveListener(OnDeepLinkActivatedHandler);
        }

        UserAccountManager.OnUserSpecificDataError.RemoveListener(OnError);
    }
    private void UserAccountManager_OnUserIdError(string arg0)
    {
        LoadingScreen.instance.SetLoading(false);
        notificationWindow.OnNotificationStarts(arg0, 5);
    }

    public void SetupRegionTable()
    {
        //        Asia Singapore   asia
        //Australia   Sydney au
        //Canada, East Montreal    cae
        //Chinese Mainland(See Instructions) Shanghai cn
        //Europe Amsterdam   eu
        //Hong Kong Hong Kong hk
        //India Chennai	in
        //Japan Tokyo   jp
        //South Africa Johannesburg    za
        //South America Sao Paulo sa
        //South Korea Seoul kr
        //Turkey Istanbul    tr
        //United Arab Emirates    Dubai uae
        //USA, East Washington D.C.us
        //USA, West   San José    usw
        //USA, South Central Dallas  ussc
        RegionTable = new Dictionary<string, string>();
        RegionTable.Add("Asia", "asia");
        //RegionTable.Add("Australia", "au");
        //RegionTable.Add("Canada", "cae");
        RegionTable.Add("Europe", "eu");
        //RegionTable.Add("Hong Kong", "hk");
        //RegionTable.Add("India", "in");
        //RegionTable.Add("Japan", "jp");
        //RegionTable.Add("South Africa", "za");
        //RegionTable.Add("South America", "sa");
        //RegionTable.Add("South Korea", "kr");
        //RegionTable.Add("Turkey", "tr");
        //RegionTable.Add("United Arab Emirates America", "uae");
        RegionTable.Add("USA", "us");
        //RegionTable.Add("USA, West", "usw");
        //RegionTable.Add("USA, South", "ussc");

    }

    public void FillRegionDropTable()
    {
        RegionDropdown.ClearOptions();
        RegionDropdownJoin.ClearOptions();
        foreach (var key in RegionTable.Keys)
        {
            RegionDropdown.options.Add(new TMP_Dropdown.OptionData(key));
            RegionDropdownJoin.options.Add(new TMP_Dropdown.OptionData(key));
        }
        if (!PlayerPrefs.HasKey("choosen_region"))
        {
            PlayerPrefs.SetString("choosen_region", "Europe");
            PlayerPrefs.SetString("choosen_region_token", "eu");
            PlayerPrefs.Save();
        }
        string choosen_region = PlayerPrefs.GetString("choosen_region");
        for (int i = 0; i < RegionDropdown.options.Count; i++)
        {
            if (RegionDropdown.options[i].text.Equals(choosen_region))
            {
                RegionDropdown.SetValueWithoutNotify(i);
                RegionDropdownJoin.SetValueWithoutNotify(i);
                var optionToken = RegionTable[choosen_region];
                //Debug.Log(optionToken);
                //SessionInfo.RoomData.RegionToken = optionToken;
                break;
            }
        }

        //RegionDropdown.SetValueWithoutNotify()


    }
    void OnEnable()
    {
        UserAccountManager.OnUserDataRetrieved.AddListener(OnUserDataRetrievedHandler);
    }

    void OnDisable()
    {
        UserAccountManager.OnUserDataRetrieved.RemoveListener(OnUserDataRetrievedHandler);
    }
    void OnUserDataRetrievedHandler(string key, string jsonData)
    {
        if (key.StartsWith("RoomDesign_"))
        {

            RoomJsonWrapper savedData = RoomJsonWrapper.ConvertJSONToFurnitureJSONListWrapper(jsonData);
            if (KeyLoadedAndAdded == key && jsonData != null)
            {
                RoomSavedManager.instance.LoadSavedRoom(savedData);
            }

            if (!savedData.IsShared)
            {
                if (!MyHomesListWrappers.ContainsKey(key))
                {
                    MyHomesListWrappers.Add(key, savedData);
                }
                else
                {
                    MyHomesListWrappers[key] = savedData;
                }
            }
            else
            {
                if (!InvitedListWrappers.ContainsKey(key))
                {
                    InvitedListWrappers.Add(key, savedData);
                }
                else
                {
                    InvitedListWrappers[key] = savedData;
                }
            }
        }

        OnUpdateNewData?.Invoke();
    }


    public void Ui_OnUploadButtonPressed()
    {
        LoadingScreen.instance.SetLoading(true);
        SessionInfo.RoomData = RoomToOpenData.UploadNewLocalSession();
        if (SessionInfo.instance.IsDebugging)
        {
            SessionInfo.RoomData.Print();
        }
        StartCoroutine(DoActionOnNextFrame(() => { SessionInfo.LoadScene(SessionInfo.AssetUpdoader); }));

    }
    public void Ui_OnUploadButtonPressedTest()
    {
        LoadingScreen.instance.SetLoading(true);
        StartCoroutine(DoActionOnNextFrame(() =>
        {
            SessionInfo.LoadScene(SessionInfo.AssetUploaderTest);
        }));
    }

    public void Ui_OnLinkButtonPressed()
    {
        LinkSharingWrapper.SetActive(true);
        EnteredLinkOfSharedRoom.Select();
        EnteredLinkOfSharedRoom.ActivateInputField();
    }

    public void TryOpeningUrlRoom()
    {
        
        TestLoadedProject(/*UrlGetterHelper.GetParentUrl() */ Application.absoluteURL);
        if (KeyInUrl != null || UsernameInUrl != null)
        {
            LoadingScreen.instance.SetLoading(true);
            UserAccountManager.Instance.GetUserDataSpecificWithUsername(UsernameInUrl, KeyInUrl);
        }
    }
    public void Ui_OnLoadOldProjectWithLink()
    {

        IsOwenedByCurrentUser = false;
        TestLoadedProject(EnteredLinkOfSharedRoom.text);
        if (UserAccountManager.userAccountInfo.Username == UsernameInUrl)
        {
            IsOwenedByCurrentUser = true;
        }

        LoadingScreen.instance.SetLoading(true);
        UserAccountManager.Instance.GetUserDataSpecificWithUsername(UsernameInUrl, KeyInUrl);
        LinkSharingWrapper.SetActive(false);
    }

    public void LoadSavedRoom(RoomJsonWrapper furnitureWrapper)
    {
        if (!IsMultiplayerSession)
        {
            LoadingScreen.instance.SetLoading(true);
            //FurnitureWrapper = furnitureWrapper;
            transform.parent = null;
            DontDestroyOnLoad(gameObject);
            //isLoadedScene = true;
            //isLoadAutomatically = true;

            SessionInfo.RoomData = RoomToOpenData.LoadOldLocalSession(furnitureWrapper);
            if (SessionInfo.instance.IsDebugging)
            {
                SessionInfo.RoomData.Print();
            }
#if UNITY_ANDROID
            StartCoroutine(DoActionOnNextFrame(() =>
            {
                SessionInfo.RoomData.RoomWrapper.MarkRoomOpened();
                SessionInfo.LoadScene(SessionInfo.RoomEditorAr);
            }));
#else
            StartCoroutine(DoActionOnNextFrame(() =>
            {
                SessionInfo.RoomData.RoomWrapper.MarkRoomOpened();
                SessionInfo.LoadScene(SessionInfo.AssetUpdoader);
            }));
#endif
        }
        else
        {

            //FurnitureWrapper = furnitureWrapper;
            transform.parent = null;
            DontDestroyOnLoad(gameObject);
            //isLoadedScene = true;
            //isLoadAutomatically = true;
            SessionInfo.RoomData.RoomWrapper.MarkRoomOpened();
            SessionInfo.RoomData = RoomToOpenData.LoadOldMultiplayerSession(furnitureWrapper);
            if (SessionInfo.instance.IsDebugging)
            {
                SessionInfo.RoomData.Print();
            }

            //MultiplayerRoomSavedDetails = new MultiplayerRoomSavedWrapper(RoomSavedLeaveSceneAction.LoadOldRoom, furnitureWrapper);
        }

    }

    //public void ClearRoomSaveManager()
    //{
    //    FurnitureWrapper = null;
    //    isLoadedScene = false;
    //}

    public void ToggleRoomJsonWrapperShare(RoomJsonWrapper furnitureWrapper)
    {
        string key = furnitureWrapper.SceneBaseID;
        furnitureWrapper.IsShared = !furnitureWrapper.IsShared;
        if (String.IsNullOrEmpty(furnitureWrapper.OriginalOwnerUsername))
        {
            furnitureWrapper.OriginalOwnerUsername = UserAccountManager.userAccountInfo.Username;
        }
        UserAccountManager.Instance.SetUserData("RoomDesign_" + key, furnitureWrapper.ConvertToJSON(), UserDataPermission.Public);
        //ReloadLists("");
    }


    public string AllowShare(RoomJsonWrapper furnitureWrapper)
    {
        string key = furnitureWrapper.SceneBaseID;
        string username = UserAccountManager.userAccountInfo.Username;

        furnitureWrapper.OriginalOwnerUsername = username;

        UserAccountManager.Instance.SetUserData(
            "RoomDesign_" + key,
            furnitureWrapper.ConvertToJSON(),
            UserDataPermission.Public
        );

        string escapedUsername = UnityWebRequest.EscapeURL(username);
        string escapedRoom = UnityWebRequest.EscapeURL(key);

        string url = "";

#if UNITY_ANDROID
        url = "https://ivris-webapp-ai.netlify.app/open?player=" + escapedUsername + "&Room=" + escapedRoom;
#elif UNITY_IOS
    url = "https://ivris-webapp-ai.netlify.app/open?player=" + escapedUsername + "&Room=" + escapedRoom;
#elif UNITY_WEBGL
    url = "https://ivris-webapp-ai.netlify.app/open?player=" + escapedUsername + "&Room=" + escapedRoom;
#else
    url = "https://ivris-webapp-ai.netlify.app/open?player=" + escapedUsername + "&Room=" + escapedRoom;
#endif

        return url;
    }


    //public IEnumerator DuplicateAndPrepareShareUrl(RoomJsonWrapper furnitureWrapper, out string generatedUrl)
    //{
    //    string key = furnitureWrapper.SceneBaseID;
    //    furnitureWrapper.OriginalOwnerUsername = UserAccountManager.userAccountInfo.Username;



    //    UserAccountManager.Instance.SetUserData("RoomDesign_" + key, furnitureWrapper.ConvertToJSON(), UserDataPermission.Public);
    //}

    //public IEnumerator AllowShareRoutine(RoomJsonWrapper furnitureWrapper)
    //{

    //}
    //public IEnumerator GetToken(RoomJsonWrapper furnitureWrapper, out string token)
    //{

    //}




    public void AllowShareLink(RoomJsonWrapper furnitureWrapper, Action<string> onSucess, Action<string> onError)
    {


        //var url = AllowShare(furnitureWrapper);

        ////Debug.Log(url);
        //// string encrypted = SimpleEncryption.Encrypt(url,SimpleEncKey,SimpleEncIv);
        //ExportedUrlWindowPanel.gameObject.SetActive(true);
        //ExportedUrlInputField.text = url;
        // ExportedUrlInputField.interactable = false;

        StartCoroutine(AllowShareLinkRoutine(furnitureWrapper, onSucess, onError));
    }

    public IEnumerator AllowShareLinkRoutine(RoomJsonWrapper furnitureWrapper, Action<string> onSucess, Action<string> onError)
    {


        string token = "";
        bool isSuccess = false;
        string error = "";

        yield return StartCoroutine(UserAccountManager.m_FurnitureNetwork.DuplicateFurniture(furnitureWrapper.OriginUrl, (result) => { token = result.token; isSuccess = true; }, (errorCallBack) => { error = errorCallBack; }));

        if (isSuccess)
        {

            furnitureWrapper.Token = token;

            string url = AllowShare(furnitureWrapper);
            onSucess?.Invoke(url);
        }
        else
        {
            notificationWindow.OnNotificationStarts("Failded to find room model\n" + error, 5);
            onError?.Invoke(error);
        }
        LoadingScreen.instance.SetLoading(false);

    }

    public void ShowExportedUrlWindowPanel(string url)
    {
        ExportedUrlWindowPanel.gameObject.SetActive(true);
        ExportedUrlInputField.text = url;

    }

    public string TestLoadedProject(string encryptedUrl)
    {
        // var applicationUrl = SimpleEncryption.Decrypt(encryptedUrl,SimpleEncKey,SimpleEncIv);
        var applicationUrl = encryptedUrl;
        //Debug.Log(applicationUrl);

        if (!applicationUrl.Contains(tokenArgName))
            return null;

        var splitApplication = applicationUrl.Split("?");
        string player = string.Empty;
        string room = string.Empty;

        // Find the fragment part of the URL
        Uri uri = new Uri(applicationUrl);
        string host = uri.Host;
        string fragment = uri.Fragment;

        if (!string.IsNullOrEmpty(uri.Query))
        {
            // Remove the leading '#' from the fragment


            // Parse the query string
            var queryParameters = HttpUtility.ParseQueryString(uri.Query);
            player = queryParameters["player"];
            room = queryParameters["Room"];
        }

        // ChangeURL(splitApplication[0]);
        UsernameInUrl = player;
        KeyInUrl = "RoomDesign_" + room;
        //Debug.Log(player + "," + KeyInUrl);
        return KeyInUrl;
    }


    public void UserAccountManager_RetrievedSpecificData(string key, string data)
    {
        if (SceneManager.GetActiveScene().name != SessionInfo.RoomSaved) { return; }
        if (key == KeyInUrl && data != null)
        {
            //UserAccountManager.m_FurnitureNetwork.UploadFurniture(selectedFileName, null, (result) => LoadModelFromFileWithIdFromPrivateServer(result.id))

            StartCoroutine(DuplicateFurnitureWrapperRoutineAndAdd(key, data));
        }
        else
        {
            LoadingScreen.instance.SetLoading(false);
            notificationWindow.OnNotificationStarts("could't retireve room", 5);
            LoadingWrapper.SetActive(false);
        }
    }



    public IEnumerator DuplicateFurnitureWrapperRoutineAndAdd(string key, string data)
    {
        DataInUrl = data;
        RoomJsonWrapper furnitureWrapper = RoomJsonWrapper.ConvertJSONToFurnitureJSONListWrapper(DataInUrl);
        RoomJsonWrapper cloneFurnitureWrapper = furnitureWrapper.CloneDifferentID();
        string id = "-1";

        bool isSuccess = false;
        string error = "";
        //yield return StartCoroutine(UserAccountManager.m_FurnitureNetwork.AddFurnitureOwner(int.Parse(cloneFurnitureWrapper.OriginUrl), UserAccountManager.userAccountInfo.Username, () =>{ Debug.Log("added"); },(errorCall) => { Debug.LogError(errorCall); }));

        yield return StartCoroutine(UserAccountManager.m_FurnitureNetwork.ClaimDuplicateFurniture(cloneFurnitureWrapper.Token, null, (result) => { id = result.id; isSuccess = true; }, (errorCallBack) => { error = errorCallBack; }));
        if (isSuccess)
        {
            cloneFurnitureWrapper.IsShared = true;
            cloneFurnitureWrapper.LastOpenedUtc = DateTime.Now;
            KeyLoadedAndAdded = "RoomDesign_" + cloneFurnitureWrapper.SceneBaseID;
            cloneFurnitureWrapper.OriginUrl = id;
            UserAccountManager.Instance.SetUserData("RoomDesign_" + cloneFurnitureWrapper.SceneBaseID, cloneFurnitureWrapper.ConvertToJSON(), UserDataPermission.Public);
            LoadingScreen.instance.SetLoading(false);
            notificationWindow.OnNotificationStarts(cloneFurnitureWrapper.SceneName + " has been added to invited rooms", 5);
            ReloadLists("");
            Ui_OnInvitedHomesListViewPressed();
        }
        else
        {
            notificationWindow.OnNotificationStarts("Failded to find room", 5);
            Debug.LogError(error);
            Debug.Log(cloneFurnitureWrapper.OriginUrl);
            LoadingScreen.instance.SetLoading(false);
        }

    }


    public void CopyRoomLink()
    {
        CopyInputFieldText(ExportedUrlInputField);
    }
    public void CopyInputFieldText(TMP_InputField inputField)
    {
        string text = inputField.text;

#if UNITY_EDITOR
        CopyToClipboardInEditor(text);
#elif UNITY_WEBGL
         CopyToClipboardInWebGL(text);
#endif
    }
    private void CopyToClipboardInEditor(string text)
    {
        TextEditor textEditor = new TextEditor();
        textEditor.text = text;
        textEditor.SelectAll();
        textEditor.Copy();
        Debug.Log("Text copied to clipboard: " + text);
    }

    private void CopyToClipboardInWebGL(string text)
    {
#if UNITY_WEBGL
        CopyToClipboard(text);
        Debug.Log("Text copied to clipboard: " + text);
#endif
    }

    private void UserAccountManager_OnUserIdRetrieved(string playFabId)
    {
        if (SceneManager.GetActiveScene().name != SessionInfo.RoomSaved) { return; }

        if (playFabId != null && KeyInUrl != null)
        {
            UserAccountManager.Instance.GetUserDataSpecificWithID(playFabId, KeyInUrl);
        }
        else
        {
            LoadingWrapper.SetActive(false);
        }
    }

    public void ClearCurrentLoading()
    {
        LoadingWrapper.SetActive(false);
    }
    public void PopulateSavedRooms()
    {
        MyHomesListWrappers.Clear();
        SharedListWrappers.Clear();
        InvitedListWrappers.Clear();
        UserAccountManager.Instance.GetAllUserDataKeys();
    }



    [SerializeField] private Transform DialogRemoveHome;
    private RoomJsonWrapper CurrentFurnitureJSONListWrapperToRemove;


    // private Dictionary<string,FurnitureJSONListWrapper> furnitureJsonListWrappers;
    public void ConfirmRemoveHomeDataEntry()
    {
        //MyHomesListWrappers.Clear();
        //SharedListWrappers.Clear();
        //InvitedListWrappers.Clear();
        RemoveHomeDataEntry(CurrentFurnitureJSONListWrapperToRemove);
        //UserAccountManager.Instance.RemoveUserData("RoomDesign_" + CurrentFurnitureJSONListWrapperToRemove.SceneBaseID);
        //DeletedRoomList.Add("RoomDesign_" + CurrentFurnitureJSONListWrapperToRemove.SceneBaseID);

        //MyHomesListWrappers.Remove("RoomDesign_" + CurrentFurnitureJSONListWrapperToRemove.SceneBaseID);
        //InvitedListWrappers.Remove("RoomDesign_" + CurrentFurnitureJSONListWrapperToRemove.SceneBaseID);

        CurrentFurnitureJSONListWrapperToRemove = null;
        DialogRemoveHome.gameObject.SetActive(false);
        //ShowListWithoutRemovedList();
        // OnUpdateNewData?.Invoke();

    }
    public void RemoveHomeDataEntry(RoomJsonWrapper roomToRemove)
    {
        StartCoroutine(RemoveHomeDataEntryRoutine(roomToRemove));
    }

    public void ReloadLists(string result)
    {
        if (SceneManager.GetActiveScene().name != SessionInfo.RoomSaved) { return; }
        PopulateSavedRooms();
        OnUpdateNewData?.Invoke();
    }

    public void ShowListWithoutRemovedList()
    {
        OnUpdateRemoveDataList?.Invoke(DeletedRoomList);
    }

    public void CancelRemoveHomeDataEntry()
    {
        CurrentFurnitureJSONListWrapperToRemove = null;
        DialogRemoveHome.gameObject.SetActive(false);
    }

    public void ViewDialogRemoveHome(RoomJsonWrapper furnitureWrapper)
    {
        CurrentFurnitureJSONListWrapperToRemove = furnitureWrapper;
        DialogRemoveHome.gameObject.SetActive(true);
    }


    public void Ui_OnMyHomesListViewPressed()
    {
        currentchoosenFurnitureJSONListWrapper = RoomSavedManagerDic.MyHomes;
        OnUpdateNewData?.Invoke();
        UpdateButtons();
    }

    public void Ui_OnSharedHomesListViewPressed()
    {
        currentchoosenFurnitureJSONListWrapper = RoomSavedManagerDic.Shared;
        OnUpdateNewData?.Invoke();
    }

    public void Ui_OnInvitedHomesListViewPressed()
    {
        currentchoosenFurnitureJSONListWrapper = RoomSavedManagerDic.Invited;
        OnUpdateNewData?.Invoke();
        UpdateButtons();
    }

    void UpdateButtons()
    {
        MyHomesOn.gameObject.SetActive(false);
        InvitedOn.gameObject.SetActive(false);

        MyHomesOff.gameObject.SetActive(false);
        InvitedOff.gameObject.SetActive(false);
        switch (RoomSavedManager.instance.currentchoosenFurnitureJSONListWrapper)
        {
            case RoomSavedManagerDic.MyHomes:
                {

                    MyHomesOn.gameObject.SetActive(true);
                    InvitedOff.gameObject.SetActive(true);

                    break;
                }

            case RoomSavedManagerDic.Invited:
                {
                    MyHomesOff.gameObject.SetActive(true);
                    InvitedOn.gameObject.SetActive(true);
                    break;
                }

        }
    }

    void OnError(string errorStr)
    {
        if (SceneManager.GetActiveScene().name != SessionInfo.RoomSaved) { return; }
        notificationWindow.OnNotificationStarts(errorStr, 5);
        LoadingScreen.instance.SetLoading(false);
    }

    public IEnumerator DoActionOnNextFrame(Action OnNextFrameStarts)
    {
        yield return new WaitForSeconds(Time.deltaTime);
        OnNextFrameStarts.Invoke();
    }

    [SerializeField]
    public void Ui_RoomOpenRelatedOnClick(int actionType)
    {
        Ui_RoomOpenRelatedOnClick(actionType, null);
    }

    public void Ui_RoomOpenRelatedOnClick(int actionType, RoomJsonWrapper roomJsonWrapper)
    {
        switch (actionType)
        {
            case ((int)RoomSavedLeaveSceneAction.None):
                break;
            case ((int)RoomSavedLeaveSceneAction.UploadNew):
                LocalOrMultiplayerFrameWrapper.gameObject.SetActive(true);
                NextRoomActionType = RoomSavedLeaveSceneAction.UploadNew;
                break;
            case ((int)RoomSavedLeaveSceneAction.LoadOldRoom):
                LocalOrMultiplayerFrameWrapper.gameObject.SetActive(true);
                NextRoomActionType = RoomSavedLeaveSceneAction.LoadOldRoom;
                if (roomJsonWrapper != null)
                {
                    ChoosenJsonRoomWrapper = roomJsonWrapper;
                }
                break;
            case ((int)RoomSavedLeaveSceneAction.LoadLink):
                LocalOrMultiplayerFrameWrapper.gameObject.SetActive(true);
                NextRoomActionType = RoomSavedLeaveSceneAction.LoadLink;
                break;
            case ((int)RoomSavedLeaveSceneAction.EnterAr):
                NextRoomActionType = RoomSavedLeaveSceneAction.EnterAr;

                SessionInfo.RoomData = new RoomToOpenData(RoomSavedLeaveSceneAction.EnterAr, roomJsonWrapper);

                StartCoroutine(DoActionOnNextFrame(() =>
                {
                    SessionInfo.RoomData.RoomWrapper.MarkRoomOpened();
                    SessionInfo.LoadScene(SessionInfo.RoomEditorAr);
                }));
                break;

            case ((int)RoomSavedLeaveSceneAction.LoadLinkAR):
                NextRoomActionType = RoomSavedLeaveSceneAction.LoadLinkAR;
                Ui_OnLinkButtonPressed();
                break;

        }
    }

    public void OpenArRoom(RoomJsonWrapper roomJsonWrapper)
    {
        Ui_RoomOpenRelatedOnClick(4, roomJsonWrapper);
    }
    public void Ui_ChooseIsMultiplayerSession(bool isMultiplayerSession)
    {
        IsMultiplayerSession = isMultiplayerSession;
        LocalOrMultiplayerFrameWrapper.gameObject.SetActive(false);
        if (NextRoomActionType.Equals(RoomSavedLeaveSceneAction.None))
        {
            return;
        }
        else if (NextRoomActionType.Equals(RoomSavedLeaveSceneAction.LoadOldRoom) && (ChoosenJsonRoomWrapper == null))
        {
            return;
        }

        if (!IsMultiplayerSession)
        {
            //SessionInfo.RoomData;
            switch (NextRoomActionType)
            {
                case RoomSavedLeaveSceneAction.UploadNew:
                    {
                        Ui_OnUploadButtonPressed();
                        break;
                    }
                case RoomSavedLeaveSceneAction.LoadOldRoom:
                    {
                        LoadSavedRoom(ChoosenJsonRoomWrapper);
                        break;
                    }
                case RoomSavedLeaveSceneAction.LoadLink:
                    {
                        Ui_OnLinkButtonPressed();
                        break;
                    }
            }
        }
        else
        {
            CreateRoomFrameWrapper.gameObject.SetActive(true);
            switch (NextRoomActionType)
            {
                case RoomSavedLeaveSceneAction.UploadNew:
                    {
                        //MultiplayerRoomSavedDetails = new MultiplayerRoomSavedWrapper(RoomSavedLeaveSceneAction.UploadNew);
                        //CreateRoomFrameWrapper.gameObject.SetActive(true);
                        SessionInfo.RoomData = RoomToOpenData.UploadNewMultiplayerSession();
                        if (SessionInfo.instance.IsDebugging)
                        {
                            SessionInfo.RoomData.Print();
                        }
                        break;
                    }
                case RoomSavedLeaveSceneAction.LoadOldRoom:
                    {
                        //LoadSavedRoom(ChoosenJsonRoomWrapper);
                        SessionInfo.RoomData = RoomToOpenData.LoadOldMultiplayerSession(ChoosenJsonRoomWrapper);
                        if (SessionInfo.instance.IsDebugging)
                        {
                            SessionInfo.RoomData.Print();
                        }
                        LoadSavedRoom(ChoosenJsonRoomWrapper);
                        break;
                    }
                case RoomSavedLeaveSceneAction.LoadLink:
                    {
                        Ui_OnLinkButtonPressed();
                        break;
                    }
            }
        }
    }

    public void Ui_CreateRoomPressed()
    {
        if (string.IsNullOrEmpty(RoomNameMultiCreation.text))
        {
            return;
        }
        CreateRoomFrameWrapper.gameObject.SetActive(false);



        //MultiplayerRoomSavedDetails.MultiRoomName = RoomNameMultiCreation.text;
        //MultiplayerRoomSavedDetails.MultiRoomPass = RoomPassMultiCreation.text;
        //MultiplayerRoomSavedDetails.IsCreateRoomOnLoad = true;

        if (SessionInfo.RoomData.RoomCustomProperties == null)
        {
            SessionInfo.RoomData.RoomCustomProperties = new ExitGames.Client.Photon.Hashtable();
        }


        //RoomOptions roomOptions = new RoomOptions();

        SessionInfo.RoomData.RoomCustomProperties[MultiplayerTerms.RoomName] = RoomNameMultiCreation.text;
        SessionInfo.RoomData.RoomCustomProperties[MultiplayerTerms.Password] = RoomPassMultiCreation.text;

        transform.parent = null;
        DontDestroyOnLoad(gameObject);

        SessionInfo.RoomData.RoomWrapper.MarkRoomOpened();

        StartCoroutine(DoActionOnNextFrame(() => { SessionInfo.LoadScene(SessionInfo.CharaterSelection); }));
    }

    public void JoinMultiplayerPanel()
    {
        //transform.parent = null;
        //DontDestroyOnLoad(gameObject);
        //MultiplayerRoomSavedDetails = null;
        //IsJoining = true;
        //IsMultiplayerSession = true;

        SessionInfo.RoomData = RoomToOpenData.JoinMultiplayerSession();
        if (SessionInfo.instance.IsDebugging)
        {
            SessionInfo.RoomData.Print();
        }
        StartCoroutine(DoActionOnNextFrame(() =>
        {
            SessionInfo.LoadScene(SessionInfo.CharaterSelection);
        }));
    }


    public void Dropdown_OnValueChanged_Region(int optionIndex)
    {
        var optionChoosed = RegionDropdown.options[optionIndex].text;

        if (optionChoosed != null)
        {
            var optionToken = RegionTable[optionChoosed];
            //Debug.Log(SessionInfo.RoomData);
            SessionInfo.RoomData.RegionToken = optionToken;

            PlayerPrefs.SetString("choosen_region", optionChoosed);
            PlayerPrefs.SetString("choosen_region_token", optionToken);
            PlayerPrefs.Save();
        }
    }

    private IEnumerator RemoveHomeDataEntryRoutine(RoomJsonWrapper roomToRemove)
    {
        if (!int.TryParse(roomToRemove.OriginUrl, out int furnitureId))
        {
            Debug.LogError($"Invalid SceneBaseID: {roomToRemove.SceneBaseID}");
            yield break;
        }

        bool success = false;
        string error = null;

        yield return StartCoroutine(UserAccountManager.m_FurnitureNetwork.DeleteFurniture(
            roomToRemove.OriginUrl,
            callback: () => success = true,
            errorCallback: (err) => error = err
        ));

        if (!success)
        {
            Debug.LogError($"Server delete failed for {furnitureId}: {error} \n {error}");
            yield break; // IMPORTANT: don't remove PlayFab/local data if server delete failed
        }

        // Only continue if server delete succeeded
        RemoveHomeDataEntry_Local(roomToRemove);
    }

    private void RemoveHomeDataEntry_Local(RoomJsonWrapper roomToRemove)
    {
        UserAccountManager.Instance.RemoveUserData("RoomDesign_" + roomToRemove.SceneBaseID);
        DeletedRoomList.Add("RoomDesign_" + roomToRemove.SceneBaseID);

        MyHomesListWrappers.Remove("RoomDesign_" + roomToRemove.SceneBaseID);
        InvitedListWrappers.Remove("RoomDesign_" + roomToRemove.SceneBaseID);

        ShowListWithoutRemovedList();
    }
}


