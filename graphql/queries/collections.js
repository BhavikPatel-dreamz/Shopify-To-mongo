import { gql } from "graphql-request";

export const collectionsQuery = `
  query GetCollections($cursor: String) {
  collections(first: 50, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        title
        handle
        description
        descriptionHtml
        updatedAt
        image {
          url
          altText
          width
          height
        }
        productsCount {
          count
        }
      }
    }
  }
}
`;


 export const collectionProductsQuery = `
  query CollectionProducts($handle: String!, $cursor: String) {
    collectionByHandle(handle: $handle) {
      id
      title
      handle
      products(first: 50, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            handle
            description
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                }
              }
            }
            images(first: 5) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  }
`;


