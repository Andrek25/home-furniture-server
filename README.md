# API documentation

## GET api/v1/furnitures

Get all furnitures.

- You must own the furniture.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token

### Response

```json
{
  "furnitures": [
    {
      "id": 1,
      "file_name": "file.zip",
      "thumbnail": "/thumbnails/image.png"
    },
    {
      "id": 2,
      "file_name": "file.zip",
      "thumbnail": "/thumbnails/image.png"
    }
  ]
}
```

## GET api/v1/furnitures/:id

Get a furniture by id.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token

### Response

Raw zip file.

## POST api/v1/furniture

Upload a new furniture.

- You will be the owner of the furniture.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token
- Content-Type: multipart/form-data

Body:

```json
{
  "file": <file>, // The raw zip file.
  "thumbnail": <file> // The thumbnail image raw file.
}
```

### Response

```json
{
  "id": <furniture id> // The id of the new furniture.
}
```

## DELETE api/v1/furniture/:id

Delete a furniture by id.

- You must own the furniture.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token

### Response

200 OK

## POST api/v1/furniture/:id/file

> [!WARNING]
> We are using POST instead of PATCH because the current Unity client implementation doesn't support PATCH.

Replace the furniture zip file.

- You must own the furniture.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token
- Content-Type: multipart/form-data

Body:

```json
{
  "file": <file> // The raw zip file.
}
```

### Response

200 OK

## POST api/v1/furniture/:id/thumbnail

> [!WARNING]
> We are using POST instead of PATCH because the current Unity client implementation doesn't support PATCH.

Replace the furniture thumbnail.

- You must own the furniture.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token
- Content-Type: multipart/form-data

Body:

```json
{
  "thumbnail": <file> // The thumbnail image raw file.
}
```

### Response

200 OK

## GET /thumbnails/:id

Get a furniture thumbnail by id.

- You dont need to own the furniture to get the thumbnail.

### Response

Raw image file.

## GET api/v1/furniture/:id/owners

Get the owners of a furniture.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token

### Response

```json
{
  "furnitureId": <furniture id>, // The id of the furniture.
  "owners": [ // The owners of the furniture.
    <user id>,
    <user id>
  ]
}
```

## GET api/v1/duplicate-furniture/:id

Duplicate a furniture by id, this will generate a new token for the duplicated furniture, so other users can claim it.

- You must own the furniture.
- The furniture will be created when the token is claimed.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token

### Response

```json
{
  "token": <token> // The token for the duplicated furniture.
}
```

## POST api/v1/duplicate-furniture/:token

Claim a duplicated furniture by token, this will create a new furniture with the same file and thumbnail (if not provided).

- The token can be used as many times as you want.
- The furniture duplicated will save a reference to the original furniture.
- The thumbnail is optional and will use the original thumbnail if not provided.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token
- Content-Type: multipart/form-data

Body:

```json
{
  "thumbnail": <file> // The thumbnail image raw file.
}
```

### Response

```json
{
  "id": <furniture id> // The id of the new furniture.
}
```

## Get furniture thumbnail

Get the thumbnail of a furniture by id.

- Anyone can access thumbnails without authentication.

### Request

Headers:

- X-PLAYFAB-AUTH-TOKEN: PlayFab authentication token

### Response

Raw image file.
