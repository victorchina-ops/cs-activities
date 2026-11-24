using System;

namespace MyApp;

public class Program
{
    public static void Main()
    {
        System.Console.WriteLine("fs");
        Console.WriteLine(Program.Twice(4));
    }
    public static int Twice(int x) { return x + x; }
}
