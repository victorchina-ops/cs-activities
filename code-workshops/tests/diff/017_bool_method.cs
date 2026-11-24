using System;

class Program
{
    static bool IsEven(int n)
    {
        return n % 2 == 0;
    }

    static bool IsLeapYear(int year)
    {
        return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    }

    static void Main()
    {
        Console.WriteLine(IsEven(4));
        Console.WriteLine(IsEven(-3));
        Console.WriteLine(IsEven(-4));
        int y = int.Parse(Console.ReadLine());
        if (IsLeapYear(y)) Console.WriteLine("leap"); else Console.WriteLine("regular");
    }
}
