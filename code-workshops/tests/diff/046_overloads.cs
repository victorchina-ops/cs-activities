using System;

class Program
{
    static int Twice(int x) { return x * 2; }
    static double Twice(double x) { return x * 2; }
    static string Twice(string s) { return s + s; }
    static void Main()
    {
        Console.WriteLine(Twice(3));
        Console.WriteLine(Twice(1.5));
        Console.WriteLine(Twice("ab"));
        Console.WriteLine(Twice('a'));
    }
}
