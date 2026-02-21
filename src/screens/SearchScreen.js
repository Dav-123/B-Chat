import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { searchMessages } from '../services/database';

const SearchScreen = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const handleSearch = async (text) => {
    setSearchQuery(text);
    
    if (text.trim().length > 0) {
      const results = await searchMessages(text.trim(), 'user-id');
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const renderResult = ({ item }) => {
    return (
      <TouchableOpacity style={styles.resultItem}>
        <View style={styles.resultInfo}>
          <Text style={styles.resultText} numberOfLines={2}>
            {item.content}
          </Text>
          <Text style={styles.resultTime}>
            {new Date(item.timestamp).toLocaleDateString()}
          </Text>
        </View>
        <Icon name="chevron-forward" size={20} color="#888" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.searchContainer}>
          <Icon name="search" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Icon name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {searchResults.length > 0 ? (
        <FlatList
          data={searchResults}
          renderItem={renderResult}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.resultsList}
        />
      ) : searchQuery.length > 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="search-outline" size={80} color="#888" />
          <Text style={styles.emptyText}>No results found</Text>
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Icon name="search-outline" size={80} color="#888" />
          <Text style={styles.emptyText}>Search your messages</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B141A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingTop: 50,
    backgroundColor: '#1C2834',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B141A',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginLeft: 10,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: '#FFFFFF',
    fontSize: 16,
  },
  resultsList: {
    padding: 15,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#1C2834',
    borderRadius: 8,
    marginBottom: 10,
  },
  resultInfo: {
    flex: 1,
  },
  resultText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 5,
  },
  resultTime: {
    color: '#888',
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginTop: 20,
  },
});

export default SearchScreen;