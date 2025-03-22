# API documentation

## GET api/v1/furnitures

Get all furnitures.

- You must own the furniture.

### Request

Headers:

- x-playfab-auth-token: PlayFab authentication token

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

- You must own the furniture.

### Request

Headers:

- x-playfab-auth-token: PlayFab authentication token

### Response

Raw zip file.

## POST api/v1/furniture

Upload a new furniture.

- You will be the owner of the furniture.

### Request

Headers:

- x-playfab-auth-token: PlayFab authentication token
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

- x-playfab-auth-token: PlayFab authentication token

### Response

200 OK

## POST api/v1/furniture/:id/file

> [!WARNING]
> We are using POST instead of PATCH because the current Unity client implementation doesn't support PATCH.

Replace the furniture zip file.

- You must own the furniture.

### Request

Headers:

- x-playfab-auth-token: PlayFab authentication token
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

- x-playfab-auth-token: PlayFab authentication token
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

## POST api/v1/furniture/:id/owner

Add a user as owner of a furniture.

- You must own the furniture.
- The user must exist.
- The user is a Master player account ID (It is the same thing as a PlayFab ID for classic APIs).

### Request

Headers:

- x-playfab-auth-token: PlayFab authentication token

Body:

```json
{
  "ownerId": <user id> // The user id to add as owner.
}
```

### Response

200 OK

## DELETE api/v1/furniture/:id/owner

Abandon the ownership of a furniture.

- You must own the furniture.
- The furniture will be deleted if there are no more owners.
- You cannot remove other users as owner.

### Request

Headers:

- x-playfab-auth-token: PlayFab authentication token

### Response

200 OK

## GET api/v1/furniture/:id/owners

Get the owners of a furniture.

- You must own the furniture.

### Request

Headers:

- x-playfab-auth-token: PlayFab authentication token

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
