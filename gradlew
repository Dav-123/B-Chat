#!/usr/bin/env sh
##############################################################################
##
##  Gradle start up script for UN*X
##
##############################################################################

# Add default JVM options here. You can also use JAVA_OPTS and GRADLE_OPTS to pass JVM options to this script.
DEFAULT_JVM_OPTS=""

APP_NAME="Gradle"
APP_BASE_NAME=$(basename "$0")

# Determine the Java command to use to start the JVM.
if [ -n "$JAVA_HOME" ] ; then
    if [ -x "$JAVA_HOME/bin/java" ] ; then
        JAVACMD="$JAVA_HOME/bin/java"
    else
        echo "Error: JAVA_HOME is set to an invalid directory: $JAVA_HOME" 1>&2
        exit 1
    fi
else
    JAVACMD=$(command -v java)
    if [ -z "$JAVACMD" ] ; then
        echo "Error: JAVA_HOME is not set and no 'java' command could be found in your PATH." 1>&2
        exit 1
    fi
fi

# Determine the directory containing this script
SCRIPT_DIR=$(cd "${0%/*}" && pwd)

# Build the classpath
CLASSPATH=$SCRIPT_DIR/gradle/wrapper/gradle-wrapper.jar

# Execute Gradle
exec "$JAVACMD" $DEFAULT_JVM_OPTS -classpath "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"
