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
